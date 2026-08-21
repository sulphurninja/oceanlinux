'use client';

/**
 * Tiny wallet fetch helper + window-event pub/sub so the topbar wallet
 * pill stays in sync after recharges or cart checkouts that debit the
 * wallet, without prop drilling or a global state library.
 */

export interface WalletSummary {
  balance: number;
  currency: string;
  totalCredits: number;
  totalDebits: number;
  isActive: boolean;
}

export const WALLET_UPDATED_EVENT = 'wallet:updated';

export function broadcastWallet(summary: WalletSummary | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT, { detail: summary }));
}

export async function fetchWalletSummary(): Promise<WalletSummary | null> {
  try {
    const res = await fetch('/api/wallet', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success || !data.wallet) return null;
    const summary: WalletSummary = {
      balance: Number(data.wallet.balance) || 0,
      currency: data.wallet.currency || 'INR',
      totalCredits: Number(data.wallet.totalCredits) || 0,
      totalDebits: Number(data.wallet.totalDebits) || 0,
      isActive: data.wallet.isActive !== false,
    };
    broadcastWallet(summary);
    return summary;
  } catch {
    return null;
  }
}

export function subscribeWallet(listener: (summary: WalletSummary | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    listener(detail || null);
  };
  window.addEventListener(WALLET_UPDATED_EVENT, handler);
  return () => window.removeEventListener(WALLET_UPDATED_EVENT, handler);
}
