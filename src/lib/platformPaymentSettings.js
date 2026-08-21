import Settings from '@/models/settingsModel';

export const PLATFORM_PAYMENT_SETTINGS_KEY = 'PLATFORM_PAYMENT';

export const DEFAULT_PLATFORM_PAYMENT_SETTINGS = {
  /** Customer checkout default: 'upi' | 'razorpay' */
  primaryGateway: 'upi',
};

function normalizeSettings(raw) {
  const base = { ...DEFAULT_PLATFORM_PAYMENT_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;
  const primaryGateway = ['upi', 'razorpay'].includes(raw.primaryGateway)
    ? raw.primaryGateway
    : base.primaryGateway;
  return { primaryGateway };
}

export async function getPlatformPaymentSettings() {
  const stored = await Settings.getSetting(PLATFORM_PAYMENT_SETTINGS_KEY, null);
  return normalizeSettings(stored);
}

export async function setPlatformPaymentSettings(value, updatedBy = null) {
  const normalized = normalizeSettings(value);
  await Settings.setSetting(
    PLATFORM_PAYMENT_SETTINGS_KEY,
    normalized,
    'Customer checkout — primary payment gateway (UPI or Razorpay first)',
    updatedBy
  );
  return normalized;
}

export async function getPrimaryPaymentMethod() {
  const settings = await getPlatformPaymentSettings();
  return settings.primaryGateway;
}

export function getFallbackPaymentMethod(primary) {
  return primary === 'razorpay' ? 'upi' : 'razorpay';
}

export function getPaymentMethodsToTry(primary) {
  const p = ['upi', 'razorpay'].includes(primary) ? primary : 'upi';
  return [p, getFallbackPaymentMethod(p)];
}

export function getPublicPlatformPaymentConfig(settings) {
  const s = normalizeSettings(settings);
  return {
    primaryGateway: s.primaryGateway,
    methodsToTry: getPaymentMethodsToTry(s.primaryGateway),
  };
}
