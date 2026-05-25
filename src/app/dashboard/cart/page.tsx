'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Wallet,
  AlertTriangle,
  Loader2,
  IndianRupee,
  ArrowRight,
  CreditCard,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fetchCart,
  removeCartItem,
  updateCartItem,
  clearCart,
  type CartSnapshot,
  type CartLine,
} from '@/lib/cartClient';
import { broadcastWallet, fetchWalletSummary } from '@/lib/walletClient';

declare global {
  interface Window {
    Razorpay: any;
    Cashfree: any;
  }
}

const OS_OPTIONS = ['Ubuntu 22', 'CentOS 7', 'Windows 2022 64'];

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [useWallet, setUseWallet] = useState<boolean>(true);
  const [gateway, setGateway] = useState<'razorpay' | 'cashfree' | 'upi'>('razorpay');
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const formatINR = useMemo(() => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format, []);

  const loadAll = async () => {
    try {
      const [cartSnapshot, walletRes] = await Promise.all([
        fetchCart(),
        fetch('/api/wallet', { credentials: 'include' }).then(r => r.json()),
      ]);
      setCart(cartSnapshot);
      if (walletRes?.success) {
        setWalletBalance(Number(walletRes.wallet.balance) || 0);
        // Keep the topbar wallet pill in sync.
        broadcastWallet({
          balance: Number(walletRes.wallet.balance) || 0,
          currency: walletRes.wallet.currency || 'INR',
          totalCredits: Number(walletRes.wallet.totalCredits) || 0,
          totalDebits: Number(walletRes.wallet.totalDebits) || 0,
          isActive: walletRes.wallet.isActive !== false,
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load cart');
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll();
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const onQty = async (line: CartLine, delta: number) => {
    const newQty = Math.max(1, Math.min(10, line.quantity + delta));
    if (newQty === line.quantity) return;
    setBusyItem(line._id);
    try {
      const updated = await updateCartItem(line._id, { quantity: newQty });
      setCart(updated);
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setBusyItem(null);
    }
  };

  const onPromo = async (line: CartLine, promo: string) => {
    setBusyItem(line._id);
    try {
      const updated = await updateCartItem(line._id, { promoCode: promo.trim() });
      setCart(updated);
      toast.success(promo.trim() ? 'Promo applied' : 'Promo cleared');
    } catch (err: any) {
      toast.error(err.message || 'Promo update failed');
    } finally {
      setBusyItem(null);
    }
  };

  const onOs = async (line: CartLine, os: string) => {
    setBusyItem(line._id);
    try {
      const updated = await updateCartItem(line._id, { os });
      setCart(updated);
    } catch (err: any) {
      toast.error(err.message || 'OS update failed');
    } finally {
      setBusyItem(null);
    }
  };

  const onRemove = async (line: CartLine) => {
    setBusyItem(line._id);
    try {
      const updated = await removeCartItem(line._id);
      setCart(updated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove item');
    } finally {
      setBusyItem(null);
    }
  };

  const onClear = async () => {
    if (!cart || cart.items.length === 0) return;
    if (!confirm('Empty the cart? This cannot be undone.')) return;
    try {
      const updated = await clearCart();
      setCart(updated);
      toast.success('Cart cleared');
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear cart');
    }
  };

  const totals = useMemo(() => {
    const subtotal = cart?.subtotal ?? 0;
    const discount = cart?.discount ?? 0;
    const total = cart?.total ?? 0;
    const walletApplied = useWallet ? Math.min(walletBalance, total) : 0;
    const gatewayCharge = Math.max(0, total - walletApplied);
    return { subtotal, discount, total, walletApplied, gatewayCharge };
  }, [cart, walletBalance, useWallet]);

  const onCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    if (cart.hasInvalidItems) {
      toast.error('Please remove unavailable items before checking out');
      return;
    }

    setCheckingOut(true);
    try {
      const initRes = await fetch('/api/cart/checkout/initiate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: gateway, useWallet }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData.success) {
        throw new Error(initData.message || 'Checkout failed');
      }

      // Wallet-only path: backend already confirmed everything
      if (initData.walletOnly) {
        toast.success(`${initData.orderIds.length} order(s) placed using wallet balance!`);
        // Wallet just got debited — refresh the topbar pill.
        fetchWalletSummary().catch(() => { });
        router.push(`/payment/callback?type=cart&client_txn_id=${initData.clientTxnId}&status=wallet_paid`);
        return;
      }

      const actualMethod: string = initData.actualPaymentMethod || gateway;
      if (initData.fallbackUsed) {
        toast.info(`${gateway} unavailable — using ${actualMethod}`);
      }

      if (actualMethod === 'razorpay') {
        await openRazorpay(initData);
      } else if (actualMethod === 'cashfree') {
        await openCashfree(initData);
      } else if (actualMethod === 'upi') {
        if (initData.upi?.payment_url) {
          window.location.href = initData.upi.payment_url;
        } else {
          throw new Error('UPI payment URL missing');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
      setCheckingOut(false);
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
      description: `Cart checkout (${data.orderIds.length} item${data.orderIds.length > 1 ? 's' : ''})`,
      order_id: data.razorpay.order_id,
      prefill: { name: data.customer.name, email: data.customer.email },
      theme: { color: '#3b82f6' },
      handler: async (response: any) => {
        try {
          const confirmRes = await fetch('/api/cart/checkout/confirm', {
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
            toast.success('Cart checkout confirmed! Provisioning your servers…');
            router.push(`/payment/callback?type=cart&client_txn_id=${data.clientTxnId}`);
          } else {
            throw new Error(cd.message || 'Checkout confirmation failed');
          }
        } catch (e: any) {
          toast.error(e.message || 'Checkout confirmation failed');
        } finally {
          setCheckingOut(false);
        }
      },
      modal: {
        ondismiss: () => setCheckingOut(false),
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
      returnUrl: `${window.location.origin}/payment/callback?type=cart&client_txn_id=${data.clientTxnId}`,
    });
    if (result?.error) {
      setCheckingOut(false);
      throw new Error(result.error.message || 'Cashfree checkout failed');
    }
    if (result?.paymentDetails) {
      try {
        const confirmRes = await fetch('/api/cart/checkout/confirm', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientTxnId: data.clientTxnId }),
        });
        const cd = await confirmRes.json();
        if (cd.success) {
          toast.success('Cart checkout confirmed!');
          router.push(`/payment/callback?type=cart&client_txn_id=${data.clientTxnId}`);
        } else {
          toast.info('Payment received — orders will be provisioned shortly.');
          router.push(`/payment/callback?type=cart&client_txn_id=${data.clientTxnId}`);
        }
      } catch {
        router.push(`/payment/callback?type=cart&client_txn_id=${data.clientTxnId}`);
      }
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 mt-16 lg:mt-0 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> Your Cart
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEmpty
              ? 'Browse the catalog to add servers to your cart.'
              : `${cart!.itemCount} item${cart!.itemCount === 1 ? '' : 's'} ready for checkout.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} /> Refresh
          </Button>
          {!isEmpty && (
            <Button variant="outline" size="sm" onClick={onClear}>
              <Trash2 className="h-4 w-4 mr-2" /> Empty Cart
            </Button>
          )}
        </div>
      </div>

      {isEmpty && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <ShoppingCart className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Your cart is empty</h2>
              <p className="text-sm text-muted-foreground">Pick servers from the catalog and they&apos;ll show up here.</p>
            </div>
            <Button onClick={() => router.push('/dashboard/ipStock')}>
              Browse plans <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {cart!.items.map((line) => {
              const invalid = !line.pricing.valid;
              return (
                <Card key={line._id} className={cn(invalid && 'border-destructive/50')}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">
                            {line.pricing.productName || (line.kind === 'slotip' ? 'Slot IP Package' : 'IP Stock')}
                          </h3>
                          <Badge variant="outline" className="capitalize">{line.kind === 'slotip' ? 'Slot IP' : 'VPS'}</Badge>
                          {line.memory && line.memory !== 'Slot IP' && (
                            <Badge variant="secondary">{line.memory}</Badge>
                          )}
                        </div>
                        {invalid && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                            <AlertTriangle className="h-4 w-4" /> {line.pricing.reason}
                          </div>
                        )}
                        {!invalid && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Unit price: {formatINR(line.pricing.unitPrice!)}
                            {line.pricing.unitDiscount! > 0 && (
                              <> · <span className="line-through">{formatINR(line.pricing.unitOriginalPrice!)}</span> · saving {formatINR(line.pricing.unitDiscount!)}</>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(line)}
                        disabled={busyItem === line._id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <Separator className="my-3" />

                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Quantity</label>
                        <div className="flex items-center mt-1 border rounded-md">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => onQty(line, -1)}
                            disabled={busyItem === line._id || line.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="px-3 text-sm font-semibold min-w-[2rem] text-center">{line.quantity}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => onQty(line, +1)}
                            disabled={busyItem === line._id || line.quantity >= 10}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {line.kind === 'ipstock' && (
                        <div>
                          <label className="text-[11px] text-muted-foreground">Operating System</label>
                          <select
                            className="mt-1 h-8 px-2 rounded-md border border-input bg-background text-sm"
                            value={line.os || 'Ubuntu 22'}
                            onChange={(e) => onOs(line, e.target.value)}
                            disabled={busyItem === line._id}
                          >
                            {OS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      )}

                      <div className="flex-1 min-w-[180px]">
                        <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Tag className="h-3 w-3" /> Promo Code
                        </label>
                        <PromoEditor
                          initial={line.promoCode || ''}
                          disabled={busyItem === line._id}
                          onApply={(code) => onPromo(line, code)}
                        />
                        {line.pricing.promoApplied && (
                          <span className="text-[11px] text-green-600">Applied: {line.pricing.promoApplied}</span>
                        )}
                      </div>

                      {!invalid && (
                        <div className="ml-auto text-right">
                          <p className="text-[11px] text-muted-foreground">Line total</p>
                          <p className="text-lg font-bold">{formatINR(line.pricing.lineTotal!)}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Order Summary</CardTitle>
                <CardDescription>Server-side validated. Promos recomputed at checkout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatINR(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-green-600">−{formatINR(totals.discount)}</span>
                  </div>
                )}
                <Separator />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Use wallet balance</p>
                      <p className="text-[11px] text-muted-foreground">Available: {formatINR(walletBalance)}</p>
                    </div>
                  </div>
                  <Switch
                    checked={useWallet}
                    onCheckedChange={setUseWallet}
                    disabled={walletBalance <= 0}
                  />
                </div>

                {useWallet && totals.walletApplied > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wallet applied</span>
                    <span className="text-green-600">−{formatINR(totals.walletApplied)}</span>
                  </div>
                )}

                {totals.gatewayCharge > 0 && (
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Pay remaining via</label>
                    <div className="grid grid-cols-3 gap-1.5">
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
                          disabled={checkingOut}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {totals.gatewayCharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Gateway charge
                    </span>
                    <span>{formatINR(totals.gatewayCharge)}</span>
                  </div>
                )}

                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Grand Total</span>
                  <span className="text-2xl font-bold flex items-center gap-1">
                    <IndianRupee className="h-5 w-5" />
                    {totals.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>

                {cart!.hasInvalidItems && (
                  <div className="text-xs text-destructive flex items-start gap-2 p-2 rounded bg-destructive/5 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    Some items are unavailable. Remove them before checkout.
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={onCheckout}
                  disabled={checkingOut || cart!.hasInvalidItems || cart!.items.length === 0}
                >
                  {checkingOut ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing</>
                  ) : (
                    <>Checkout {formatINR(totals.total)} <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>

                {walletBalance < totals.total && (
                  <Link href="/dashboard/wallet" className="text-xs text-center text-primary hover:underline block">
                    Top up wallet to skip the gateway →
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function PromoEditor({
  initial,
  onApply,
  disabled,
}: {
  initial: string;
  onApply: (code: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  return (
    <div className="flex items-center gap-1 mt-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Promo code"
        className="h-8 text-sm flex-1"
        disabled={disabled}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onApply(value)}
        disabled={disabled || value === initial}
      >
        Apply
      </Button>
    </div>
  );
}
