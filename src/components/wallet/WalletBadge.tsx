'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchWalletSummary,
  subscribeWallet,
  type WalletSummary,
} from '@/lib/walletClient';

export default function WalletBadge({
  className,
  hidden = false,
}: {
  className?: string;
  hidden?: boolean;
  compact?: boolean;
}) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    const unsub = subscribeWallet((w) => {
      if (w) setWallet(w);
    });
    const timer = window.setTimeout(() => {
      fetchWalletSummary().then((w) => {
        if (!cancelled) {
          setWallet(w);
          setHydrated(true);
        }
      });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [hidden]);

  if (hidden || !hydrated || !wallet) return null;

  const formatted = wallet.balance.toLocaleString('en-IN', {
    maximumFractionDigits: wallet.balance < 1000 ? 2 : 0,
  });

  return (
    <div className={cn('premium-dashboard-wallet-pill group/wallet', className)}>
      <Link
        href="/dashboard/wallet"
        className="premium-dashboard-wallet-link"
        title={`Wallet balance: ₹${formatted}`}
        aria-label={`Wallet balance ₹${formatted}`}
      >
        <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-300 shrink-0" aria-hidden />
        <span className="premium-dashboard-wallet-amount tabular-nums">₹{formatted}</span>
      </Link>
      <Link
        href="/dashboard/wallet"
        className="premium-dashboard-wallet-add"
        title="Add money to wallet"
        aria-label="Add money to wallet"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
