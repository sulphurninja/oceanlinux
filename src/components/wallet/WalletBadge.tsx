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

/**
 * Compact wallet balance pill for the dashboard top bar. Clicks through
 * to `/dashboard/wallet`. The "+" stub on the right opens the recharge
 * page directly.
 *
 * Hydrates the balance on mount and listens to the global
 * `wallet:updated` event so any successful recharge / checkout / refund
 * elsewhere in the app refreshes the pill instantly.
 *
 * Renders nothing if the user is unauthenticated (the GET 401s) or
 * explicitly hidden via the `hidden` prop (we hide for resellers since
 * they have their own `/dashboard/reseller-wallet`).
 */
export default function WalletBadge({
  className,
  hidden = false,
  compact = false,
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
    <div className={cn('flex items-center', className)}>
      <Link
        href="/dashboard/wallet"
        className={cn(
          'group flex items-center gap-1.5 h-8 pl-2 pr-2 rounded-l-full',
          'border border-r-0 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors',
          'text-xs font-semibold'
        )}
        title={`Wallet balance: ₹${formatted}`}
      >
        <Wallet className="h-3.5 w-3.5 text-primary" />
        {!compact && (
          <span className="text-primary">
            ₹{formatted}
          </span>
        )}
        {compact && (
          <span className="text-primary">₹{formatted}</span>
        )}
      </Link>
      <Link
        href="/dashboard/wallet"
        className={cn(
          'flex items-center justify-center h-8 w-7 rounded-r-full',
          'border border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
        )}
        title="Add money to wallet"
      >
        <Plus className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
