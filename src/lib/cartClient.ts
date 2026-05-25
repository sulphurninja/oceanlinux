'use client';

/**
 * Tiny client-side cart helper. Each call hits `/api/cart` and broadcasts
 * a `cart:updated` window event so other mounted components (header
 * cart icon, sidebar count badge) can re-render without prop drilling
 * or a global state library.
 */

export interface CartLinePricing {
  valid: boolean;
  reason?: string;
  productName?: string;
  unitOriginalPrice?: number;
  unitDiscount?: number;
  unitPrice?: number;
  lineSubtotal?: number;
  lineDiscount?: number;
  lineTotal?: number;
  promoApplied?: string | null;
}

export interface CartLine {
  _id: string;
  kind: 'ipstock' | 'slotip';
  ipStockId?: string;
  slotIpPackageId?: string;
  memory: string;
  os: string;
  quantity: number;
  promoCode: string;
  addedAt: string;
  pricing: CartLinePricing;
}

export interface CartSnapshot {
  _id: string;
  items: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  hasInvalidItems: boolean;
  updatedAt: string;
}

export const CART_UPDATED_EVENT = 'cart:updated';

function broadcast(snapshot: CartSnapshot | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: snapshot }));
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchCart(): Promise<CartSnapshot> {
  const res = await fetch('/api/cart', { credentials: 'include' });
  const data = await jsonOrThrow<{ cart: CartSnapshot }>(res);
  broadcast(data.cart);
  return data.cart;
}

export async function addToCart(payload: {
  kind: 'ipstock' | 'slotip';
  ipStockId?: string;
  slotIpPackageId?: string;
  memory?: string;
  os?: string;
  quantity?: number;
  promoCode?: string;
}): Promise<CartSnapshot> {
  const res = await fetch('/api/cart', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await jsonOrThrow<{ cart: CartSnapshot }>(res);
  broadcast(data.cart);
  return data.cart;
}

export async function updateCartItem(itemId: string, payload: {
  quantity?: number;
  promoCode?: string;
  os?: string;
  memory?: string;
}): Promise<CartSnapshot> {
  const res = await fetch(`/api/cart/${itemId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await jsonOrThrow<{ cart: CartSnapshot }>(res);
  broadcast(data.cart);
  return data.cart;
}

export async function removeCartItem(itemId: string): Promise<CartSnapshot> {
  const res = await fetch(`/api/cart/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await jsonOrThrow<{ cart: CartSnapshot }>(res);
  broadcast(data.cart);
  return data.cart;
}

export async function clearCart(): Promise<CartSnapshot> {
  const res = await fetch('/api/cart', { method: 'DELETE', credentials: 'include' });
  const data = await jsonOrThrow<{ cart: CartSnapshot }>(res);
  broadcast(data.cart);
  return data.cart;
}

/**
 * Subscribe to cart updates from anywhere in the app. Returns an
 * unsubscribe fn for use inside `useEffect`.
 */
export function subscribeCart(listener: (snapshot: CartSnapshot | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    listener(detail || null);
  };
  window.addEventListener(CART_UPDATED_EVENT, handler);
  return () => window.removeEventListener(CART_UPDATED_EVENT, handler);
}
