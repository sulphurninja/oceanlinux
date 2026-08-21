import Settings from '@/models/settingsModel';

export const RESELLER_RECHARGE_SETTINGS_KEY = 'RESELLER_WALLET_RECHARGE';

export const DEFAULT_RESELLER_RECHARGE_SETTINGS = {
  provider: 'paytm', // 'paytm' | 'kwikupi'
  paytm: {
    connected: false,
    mid: '',
    merchantKey: '',
    environment: 'production',
    posId: 'OCEAN001',
    displayName: 'OceanLinux',
    connectedAt: null,
  },
  kwikupi: {
    connected: false,
    apiKey: '',
    apiSecret: '',
    displayName: 'OceanLinux',
    connectedAt: null,
  },
  minAmount: 100,
  maxAmount: 100000,
};

function normalizeSettings(raw) {
  const base = { ...DEFAULT_RESELLER_RECHARGE_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;

  const paytm = {
    ...base.paytm,
    ...(raw.paytm || {}),
  };
  if (!paytm.merchantKey && raw.paytm?.merchantKey) {
    paytm.merchantKey = raw.paytm.merchantKey;
  }
  paytm.connected = !!(paytm.mid && paytm.merchantKey && paytm.connected !== false);

  const kwikupi = {
    ...base.kwikupi,
    ...(raw.kwikupi || {}),
  };
  if (!kwikupi.apiSecret && raw.kwikupi?.apiSecret) {
    kwikupi.apiSecret = raw.kwikupi.apiSecret;
  }
  kwikupi.connected = !!(kwikupi.apiKey && kwikupi.apiSecret && kwikupi.connected !== false);

  const provider = ['paytm', 'kwikupi'].includes(raw.provider) ? raw.provider : base.provider;

  return {
    provider,
    paytm,
    kwikupi,
    minAmount: Math.max(1, Number(raw.minAmount) || base.minAmount),
    maxAmount: Math.max(100, Number(raw.maxAmount) || base.maxAmount),
  };
}

export async function getResellerRechargeSettings() {
  const stored = await Settings.getSetting(RESELLER_RECHARGE_SETTINGS_KEY, null);
  return normalizeSettings(stored);
}

export async function setResellerRechargeSettings(value, updatedBy = null) {
  const normalized = normalizeSettings(value);
  await Settings.setSetting(
    RESELLER_RECHARGE_SETTINGS_KEY,
    normalized,
    'Reseller wallet recharge — auto UPI provider',
    updatedBy
  );
  return normalized;
}

export async function updatePaytmCredentials(partial, updatedBy = null) {
  const current = await getResellerRechargeSettings();
  const nextPaytm = {
    ...current.paytm,
    ...partial,
  };

  if (partial.merchantKey === '' || partial.merchantKey === undefined) {
    nextPaytm.merchantKey = current.paytm.merchantKey;
  }

  if (nextPaytm.mid && nextPaytm.merchantKey) {
    nextPaytm.connected = partial.connected !== false;
    if (partial.connected && !current.paytm.connectedAt) {
      nextPaytm.connectedAt = new Date().toISOString();
    }
  } else {
    nextPaytm.connected = false;
  }

  return setResellerRechargeSettings(
    {
      ...current,
      paytm: nextPaytm,
    },
    updatedBy
  );
}

export async function updateKwikUpiCredentials(partial, updatedBy = null) {
  const current = await getResellerRechargeSettings();
  const nextKwikUpi = {
    ...current.kwikupi,
    ...partial,
  };

  if (partial.apiSecret === '' || partial.apiSecret === undefined) {
    nextKwikUpi.apiSecret = current.kwikupi.apiSecret;
  }

  if (nextKwikUpi.apiKey && nextKwikUpi.apiSecret) {
    nextKwikUpi.connected = partial.connected !== false;
    if (partial.connected && !current.kwikupi.connectedAt) {
      nextKwikUpi.connectedAt = new Date().toISOString();
    }
  } else {
    nextKwikUpi.connected = false;
  }

  return setResellerRechargeSettings(
    {
      ...current,
      provider: nextKwikUpi.connected ? 'kwikupi' : current.provider,
      kwikupi: nextKwikUpi,
    },
    updatedBy
  );
}

export function getPublicResellerRechargeSettings(settings) {
  const s = normalizeSettings(settings);
  const provider = s.provider;
  return {
    provider,
    paytmConnected: !!(s.paytm.connected && s.paytm.mid),
    kwikUpiConnected: !!(s.kwikupi.connected && s.kwikupi.apiKey),
    paytmDisplayName: s.paytm.displayName || '',
    kwikUpiDisplayName: s.kwikupi.displayName || '',
    minAmount: s.minAmount,
    maxAmount: s.maxAmount,
  };
}

export function getAdminPaytmSettings(settings) {
  const s = normalizeSettings(settings);
  const key = String(s.paytm.merchantKey || '');
  const secret = String(s.kwikupi.apiSecret || '');
  return {
    provider: s.provider,
    paytm: {
      connected: s.paytm.connected,
      mid: s.paytm.mid || '',
      merchantKeyMasked: key ? `****${key.slice(-4)}` : '',
      hasMerchantKey: !!key,
      environment: s.paytm.environment || 'production',
      posId: s.paytm.posId || 'OCEAN001',
      displayName: s.paytm.displayName || 'OceanLinux',
      connectedAt: s.paytm.connectedAt || null,
    },
    kwikupi: {
      connected: s.kwikupi.connected,
      apiKey: s.kwikupi.apiKey || '',
      apiSecretMasked: secret ? `****${secret.slice(-4)}` : '',
      hasApiSecret: !!secret,
      displayName: s.kwikupi.displayName || 'OceanLinux',
      connectedAt: s.kwikupi.connectedAt || null,
    },
    minAmount: s.minAmount,
    maxAmount: s.maxAmount,
  };
}

export function getPaytmCredentials(settings) {
  const s = normalizeSettings(settings);
  if (!s.paytm.connected || !s.paytm.mid || !s.paytm.merchantKey) {
    return null;
  }
  return {
    mid: s.paytm.mid,
    merchantKey: s.paytm.merchantKey,
    environment: s.paytm.environment === 'staging' ? 'staging' : 'production',
    posId: s.paytm.posId || 'OCEAN001',
    displayName: s.paytm.displayName || 'OceanLinux',
  };
}

export function getKwikUpiCredentials(settings) {
  const s = normalizeSettings(settings);
  if (!s.kwikupi.connected || !s.kwikupi.apiKey || !s.kwikupi.apiSecret) {
    return null;
  }
  return {
    apiKey: s.kwikupi.apiKey,
    apiSecret: s.kwikupi.apiSecret,
    displayName: s.kwikupi.displayName || 'OceanLinux',
  };
}
