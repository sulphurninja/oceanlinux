'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchCart, subscribeCart, type CartSnapshot } from '@/lib/cartClient';

/**
 * Header / sidebar cart icon with a count badge. Hydrates the count on
 * mount and listens to the global `cart:updated` window event so any
 * `addToCart` / `removeCartItem` call anywhere in the app re-renders
 * the badge instantly.
 *
 * Renders nothing if the user is not authenticated (the GET fails 401).
 */
export default function CartIcon({
  className,
  variant = 'ghost',
  showLabel = false,
  hidden = false,
}: {
  className?: string;
  variant?: 'ghost' | 'outline' | 'default';
  showLabel?: boolean;
  hidden?: boolean;
}) {
  const [count, setCount] = useState<number>(0);
  const [hydrated, setHydrated] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    (async () => {
      try {
        const cart = await fetchCart();
        if (!cancelled) {
          setCount(cart.itemCount || 0);
          setAvailable(true);
        }
      } catch {
        // Likely unauthenticated; just don't render.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    const unsub = subscribeCart((snap: CartSnapshot | null) => {
      if (snap) {
        setCount(snap.itemCount || 0);
        setAvailable(true);
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [hidden]);

  if (hidden || !hydrated || !available) return null;

  return (
    <Link href="/dashboard/cart" className={cn('relative inline-flex', className)}>
      <Button
        variant="ghost"
        size={showLabel ? 'sm' : 'icon'}
        className={cn(
          'relative h-8 w-8 rounded-lg border transition-all duration-200',
          count > 0
            ? 'border-primary/30 bg-primary/5 hover:bg-primary/15 hover:border-primary/50 hover:scale-105'
            : 'border-border/60 hover:bg-muted/50 hover:border-primary/30',
          showLabel && 'gap-2 px-3 w-auto'
        )}
      >
        <ShoppingCart className={cn('h-4 w-4', count > 0 ? 'text-primary' : 'text-foreground/80')} />
        {showLabel && <span className="text-sm">Cart</span>}
        {count > 0 && (
          <span className={cn(
            'absolute -top-1 -right-1 min-w-[17px] h-[17px] flex items-center justify-center',
            'rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1',
            'border-2 border-background shadow-sm'
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>
    </Link>
  );
}
