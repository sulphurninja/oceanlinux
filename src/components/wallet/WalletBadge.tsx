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
    fetchWalletSummary().then((w) => {
      if (!cancelled) {
        setWallet(w);
        setHydrated(true);
      }
    });
    const unsub = subscribeWallet((w) => {
      if (w) setWallet(w);
    });
    return () => { cancelled = true; unsub(); };
  }, [hidden]);

  if (hidden || !hydrated || !wallet) return null;

  const formatted = wallet.balance.toLocaleString('en-IN', {
    maximumFractionDigits: wallet.balance < 1000 ? 2 : 0,
  });

  return (
    <div className={cn('group/wallet flex items-center rounded-lg overflow-hidden shadow-sm hover:shadow-md hover:shadow-primary/15 transition-shadow duration-200', className)}>
      <Link
        href="/dashboard/wallet"
        className={cn(
          'flex items-center gap-1 h-8 pl-2 pr-1.5 sm:pr-2',
          'border border-r-0 border-primary/35 bg-gradient-to-r from-primary/20 to-primary/10',
          'hover:from-primary/30 hover:to-primary/15 transition-all',
          'text-xs font-semibold'
        )}
        title={`Wallet balance: ₹${formatted}`}
      >
        <Wallet className="h-3.5 w-3.5 text-primary-foreground/80 dark:text-primary shrink-0" />
        <span className="text-primary-foreground dark:text-primary-foreground tabular-nums">
          ₹{formatted}
        </span>
      </Link>
      <Link
        href="/dashboard/wallet"
        className={cn(
          'flex items-center justify-center h-8 w-7 sm:w-8',
          'border border-primary/35 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground',
          'hover:from-primary/95 hover:to-primary/75 hover:scale-105 transition-all duration-200'
        )}
        title="Add money to wallet"
      >
        <Plus className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
