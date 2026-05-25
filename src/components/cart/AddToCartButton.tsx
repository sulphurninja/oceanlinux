'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { addToCart } from '@/lib/cartClient';

/**
 * Adds a single configuration (or slot-IP package) to the user's cart
 * via `POST /api/cart`. Optimistic toast + 2-second "added" state, then
 * resets so the user can keep adding lines without re-rendering.
 *
 * Drop next to existing `Buy Now` buttons — does NOT replace them.
 */
interface BaseProps {
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  className?: string;
  fullWidth?: boolean;
  label?: string;
  iconOnly?: boolean;
  onAdded?: () => void;
}

interface IpStockProps extends BaseProps {
  kind: 'ipstock';
  ipStockId: string;
  memory: string;
  os?: string;
  promoCode?: string;
}

interface SlotIpProps extends BaseProps {
  kind: 'slotip';
  slotIpPackageId: string;
  promoCode?: string;
}

type Props = IpStockProps | SlotIpProps;

export default function AddToCartButton(props: Props) {
  const {
    size = 'sm',
    variant = 'outline',
    className,
    fullWidth,
    label = 'Add to Cart',
    iconOnly,
    onAdded,
  } = props;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (props.kind === 'ipstock') {
        await addToCart({
          kind: 'ipstock',
          ipStockId: props.ipStockId,
          memory: props.memory,
          os: props.os,
          promoCode: props.promoCode,
          quantity: 1,
        });
      } else {
        await addToCart({
          kind: 'slotip',
          slotIpPackageId: props.slotIpPackageId,
          promoCode: props.promoCode,
          quantity: 1,
        });
      }
      setDone(true);
      toast.success('Added to cart');
      onAdded?.();
      setTimeout(() => setDone(false), 1800);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add to cart');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={busy}
      className={cn(fullWidth && 'w-full', 'gap-1.5', className)}
      title="Add to Cart"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
       done ? <Check className="h-3.5 w-3.5" /> :
              <ShoppingCart className="h-3.5 w-3.5" />}
      {!iconOnly && <span>{done ? 'Added' : label}</span>}
    </Button>
  );
}
