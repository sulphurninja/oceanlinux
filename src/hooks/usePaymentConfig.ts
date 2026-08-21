'use client';

import { useEffect, useMemo, useState } from 'react';

export type PaymentGateway = 'upi' | 'razorpay';

interface PaymentConfig {
  primaryGateway: PaymentGateway;
  methodsToTry: PaymentGateway[];
  gateways: { upi: boolean; razorpay: boolean };
  loaded: boolean;
}

const DEFAULT_CONFIG: PaymentConfig = {
  primaryGateway: 'upi',
  methodsToTry: ['upi', 'razorpay'],
  gateways: { upi: true, razorpay: true },
  loaded: false,
};

export function usePaymentConfig(): PaymentConfig {
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payment/config', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        setConfig({
          primaryGateway: data.primaryGateway === 'razorpay' ? 'razorpay' : 'upi',
          methodsToTry:
            Array.isArray(data.methodsToTry) && data.methodsToTry.length > 0
              ? data.methodsToTry.filter((m: string) => m === 'upi' || m === 'razorpay')
              : DEFAULT_CONFIG.methodsToTry,
          gateways: {
            upi: data.gateways?.upi !== false,
            razorpay: data.gateways?.razorpay !== false,
          },
          loaded: true,
        });
      } catch {
        /* keep loaded:false so checkout does not assume UPI-first on fetch failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => config, [config]);
}

export function getGatewayTryOrder(
  selected: PaymentGateway,
  primary: PaymentGateway,
  methodsToTry?: PaymentGateway[],
  userExplicitlySelected = false
): PaymentGateway[] {
  const order =
    methodsToTry && methodsToTry.length > 0
      ? methodsToTry
      : sortGatewaysByPrimary(primary);

  if (userExplicitlySelected && selected !== primary) {
    return [selected];
  }
  return order;
}

export function sortGatewaysByPrimary(primary: PaymentGateway): PaymentGateway[] {
  return primary === 'razorpay' ? ['razorpay', 'upi'] : ['upi', 'razorpay'];
}

export function primaryGatewayHint(primary: PaymentGateway): string {
  if (primary === 'razorpay') {
    return 'Razorpay is tried first. If it fails, UPI opens automatically.';
  }
  return 'UPI is tried first. If it fails, Razorpay opens automatically.';
}

export function fallbackToastMessage(from: PaymentGateway, to: PaymentGateway): string {
  if (from === 'upi' && to === 'razorpay') return 'UPI unavailable — opening Razorpay instead';
  if (from === 'razorpay' && to === 'upi') return 'Razorpay unavailable — opening UPI instead';
  return 'Switching payment method';
}
