export const OCEAN_BIRD_FLY_EVENT = 'oceanlinux:bird-fly';
export const OCEAN_CELEBRATION_COMPLETE_EVENT = 'oceanlinux:celebration-complete';

export type OceanBirdFlyVariant =
  | 'login'
  | 'order-success'
  | 'renewal-success'
  | 'wallet-success'
  | 'logout';

export type OceanBirdFlyRect = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type OceanBirdFlyDetail = {
  variant: OceanBirdFlyVariant;
  from?: OceanBirdFlyRect;
  toSelector?: string;
};

export type OceanCelebrationCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

export const OCEAN_CELEBRATION_COPY: Record<OceanBirdFlyVariant, OceanCelebrationCopy> = {
  login: {
    eyebrow: 'OceanLinux',
    title: 'Session secured',
    subtitle: 'Entering your workspace',
  },
  'wallet-success': {
    eyebrow: 'Wallet',
    title: 'Balance updated',
    subtitle: 'Funds have been added successfully',
  },
  'order-success': {
    eyebrow: 'Confirmed',
    title: 'Payment received',
    subtitle: 'Your order is now being provisioned',
  },
  'renewal-success': {
    eyebrow: 'Renewal',
    title: 'Service extended',
    subtitle: 'Your plan has been renewed',
  },
  logout: {
    eyebrow: 'OceanLinux',
    title: 'Signed out',
    subtitle: 'Your session ended securely',
  },
};

export function domRectCenter(rect: DOMRect): OceanBirdFlyRect {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

export function triggerOceanBirdFly(detail: OceanBirdFlyDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OCEAN_BIRD_FLY_EVENT, { detail }));
}

export function triggerOrderSuccessBird() {
  triggerOceanBirdFly({ variant: 'order-success' });
}

export function triggerRenewalSuccessBird() {
  triggerOceanBirdFly({ variant: 'renewal-success' });
}

export function triggerWalletSuccessBird() {
  triggerOceanBirdFly({ variant: 'wallet-success' });
}

export function triggerLoginBird(from?: OceanBirdFlyRect) {
  triggerOceanBirdFly({ variant: 'login', from });
}

export function triggerLogoutBird() {
  triggerOceanBirdFly({ variant: 'logout' });
}

export function triggerPaymentSuccessBird(
  clientTxnId?: string | null,
  callbackType?: string | null,
) {
  if (clientTxnId?.startsWith('RENEWAL_')) {
    triggerRenewalSuccessBird();
    return;
  }
  if (callbackType === 'wallet' || clientTxnId?.startsWith('WALLET_')) {
    triggerWalletSuccessBird();
    return;
  }
  triggerOrderSuccessBird();
}

export function waitForCelebrationComplete(timeoutMs = 4800): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener(OCEAN_CELEBRATION_COMPLETE_EVENT, finish);
      resolve();
    };
    window.addEventListener(OCEAN_CELEBRATION_COMPLETE_EVENT, finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}
