declare global {
  interface Window {
    Razorpay: any;
  }
}

const PAYMENT_GATEWAY_ACTIVE_CLASS = 'payment-gateway-active';

// Browser timer id. Not ReturnType<typeof setInterval>, because @types/node is in
// scope here and would resolve that to Node's Timeout instead of a number.
let lockWatchInterval: number | null = null;

export function formatRazorpayContact(phone?: string) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return '';
}

export function buildRazorpayPrefill(customer?: {
  name?: string;
  email?: string;
  phone?: string;
  contact?: string;
}) {
  const contact = formatRazorpayContact(customer?.phone || customer?.contact);
  return {
    name: customer?.name || '',
    email: customer?.email || '',
    ...(contact ? { contact } : {}),
  };
}

export async function waitForRazorpaySdk(maxAttempts = 25) {
  let attempts = 0;
  while (typeof window.Razorpay === 'undefined' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts += 1;
  }
  if (typeof window.Razorpay === 'undefined') {
    throw new Error('Razorpay SDK not loaded');
  }
}

/** Radix/shadcn dialogs set pointer-events:none on body — unblock payment gateways. */
export function clearPaymentUiLocks() {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.add(PAYMENT_GATEWAY_ACTIVE_CLASS);
  document.documentElement.style.pointerEvents = 'auto';
  document.body.style.pointerEvents = 'auto';
  document.body.style.overflow = '';
  document.body.removeAttribute('data-scroll-locked');
  document.documentElement.removeAttribute('data-scroll-locked');

  document.querySelectorAll('[data-radix-dialog-overlay]').forEach((node) => {
    const el = node as HTMLElement;
    el.style.pointerEvents = 'none';
    el.style.visibility = 'hidden';
    el.style.display = 'none';
  });

  document.querySelectorAll('[data-radix-alert-dialog-overlay]').forEach((node) => {
    const el = node as HTMLElement;
    el.style.pointerEvents = 'none';
    el.style.visibility = 'hidden';
    el.style.display = 'none';
  });
}

export function finishPaymentGatewayOverlay() {
  if (typeof document === 'undefined') return;

  stopPaymentLockWatcher();
  document.documentElement.classList.remove(PAYMENT_GATEWAY_ACTIVE_CLASS);
  document.documentElement.style.pointerEvents = '';
  document.body.style.pointerEvents = '';
}

export function startPaymentLockWatcher() {
  if (typeof window === 'undefined') return;

  stopPaymentLockWatcher();
  clearPaymentUiLocks();
  lockWatchInterval = window.setInterval(clearPaymentUiLocks, 250);
}

export function stopPaymentLockWatcher() {
  if (lockWatchInterval) {
    clearInterval(lockWatchInterval);
    lockWatchInterval = null;
  }
}

/** Close dashboard dialogs and let Radix overlays unmount before opening Razorpay. */
export async function prepareRazorpayOverlay() {
  clearPaymentUiLocks();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  clearPaymentUiLocks();
}

export type RazorpayCheckoutPayload = {
  razorpay: {
    key: string;
    amount: number;
    currency: string;
    order_id: string;
  };
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    contact?: string;
  };
};

export type OpenRazorpayModalOptions = {
  data: RazorpayCheckoutPayload;
  description: string;
  themeColor?: string;
  onSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  onDismiss?: () => void;
  onFailed?: () => void;
};

export async function openRazorpayModal(options: OpenRazorpayModalOptions) {
  await waitForRazorpaySdk();
  await prepareRazorpayOverlay();

  const {
    data,
    description,
    themeColor = '#10b981',
    onSuccess,
    onDismiss,
    onFailed,
  } = options;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    stopPaymentLockWatcher();
    document.documentElement.classList.remove(PAYMENT_GATEWAY_ACTIVE_CLASS);
    document.documentElement.style.pointerEvents = '';
    document.body.style.pointerEvents = '';
  };

  const rzp = new window.Razorpay({
    key: data.razorpay.key,
    amount: data.razorpay.amount,
    currency: data.razorpay.currency,
    name: 'OceanLinux',
    description,
    order_id: data.razorpay.order_id,
    prefill: buildRazorpayPrefill(data.customer),
    theme: { color: themeColor },
    handler: async (response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) => {
      try {
        await onSuccess(response);
      } finally {
        finish();
      }
    },
    modal: {
      ondismiss: () => {
        onDismiss?.();
        finish();
      },
      escape: true,
      confirm_close: true,
    },
  });

  rzp.on('payment.failed', () => {
    onFailed?.();
  });

  startPaymentLockWatcher();
  rzp.open();
  window.setTimeout(clearPaymentUiLocks, 150);
  window.setTimeout(clearPaymentUiLocks, 600);
}
