import { isSlotIpOrder, SLOT_IP_NO_RENEWAL_MESSAGE } from '@/lib/slotIpOrder';
import { isNexaOrder, NEXA_NO_RENEWAL_MESSAGE, nexaStockRenewalMessage } from '@/lib/nexaOrder';

/** True for admin-upload trial VPS orders (fixed trial period, no renewals). */
export function isTrialVpsOrder(order) {
  if (!order) return false;
  return (
    String(order.provider || '').toLowerCase() === 'trialvps' ||
    !!order.trialVpsPackageId ||
    !!order.trialVpsSlotId
  );
}

/** Trial package sold as Premium IP Proxy — show IP / port / user / pass. */
export function isTrialVpsProxyOrder(order) {
  if (!isTrialVpsOrder(order)) return false;
  const cat = String(order.trialVpsPlanCategory || '').toLowerCase();
  if (cat === 'premium_proxy') return true;
  if (cat === 'linux' || cat === 'windows') return false;
  // Older orders before trialVpsPlanCategory was stored (proxy uses ip:port in ipAddress)
  const ip = String(order.ipAddress || '').trim();
  return /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(ip);
}

export const TRIAL_VPS_NO_RENEWAL_MESSAGE =
  'Trial VPS cannot be renewed. Purchase a regular plan when your trial ends.';

/**
 * Trial VPS linked to an IP stock plan (SmartVPS, company Virtualizor/Prime, etc.) —
 * customer gets panel manage; renewals still blocked.
 */
export function isTrialVpsPanelManageOrder(order) {
  if (!isTrialVpsOrder(order)) return false;
  if (isTrialVpsProxyOrder(order)) return false;
  return !!(order.trialVpsPanelManage || order.ipStockId || order.trialManageCompanyId);
}

/** Slot IP + Trial VPS — one-time inventory packages. */
export function isNonRenewablePackageOrder(order) {
  return isSlotIpOrder(order) || isTrialVpsOrder(order);
}

/** Empty when the order can be renewed. Otherwise the customer-facing reason. */
export function nonRenewablePackageMessage(order) {
  if (isTrialVpsOrder(order)) return TRIAL_VPS_NO_RENEWAL_MESSAGE;
  if (isSlotIpOrder(order)) return SLOT_IP_NO_RENEWAL_MESSAGE;
  if (isNexaOrder(order)) return NEXA_NO_RENEWAL_MESSAGE;
  return '';
}

/** Slot IP, trial, and Nexa — customer-facing reason, or empty when renewal is allowed. */
export async function renewalBlockMessage(order) {
  const direct = nonRenewablePackageMessage(order);
  if (direct) return direct;
  return nexaStockRenewalMessage(order);
}
