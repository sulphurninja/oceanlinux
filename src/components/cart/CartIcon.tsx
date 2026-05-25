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
        variant={variant}
        size={showLabel ? 'sm' : 'icon'}
        className={cn('relative', showLabel && 'gap-2')}
      >
        <ShoppingCart className="h-4 w-4" />
        {showLabel && <span className="text-sm">Cart</span>}
        {count > 0 && (
          <span className={cn(
            'absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center',
            'rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1',
            'border-2 border-background'
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Button>
    </Link>
  );
}
