import {
  resolveProviderFromOrder,
  resolveCompanyIdFromIpStock,
} from '@/lib/orderAnnouncementTarget';

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function announcementCompanyId(announcement) {
  if (!announcement?.targetCompany) return null;
  const company = announcement.targetCompany;
  if (typeof company === 'object' && company._id) {
    return String(company._id);
  }
  return String(company);
}

function isProviderScopedAnnouncement(announcement) {
  if (!announcement) return false;
  const companyId = announcementCompanyId(announcement);
  if (companyId && companyId !== 'null' && companyId !== 'undefined') {
    return false;
  }
  return Boolean(normalizeProvider(announcement.targetProvider));
}

/**
 * Pick the best live manage-order announcement for an order.
 * Company news wins over provider news (same rule as admin UI).
 */
export function pickOrderPageAnnouncement(order, ipStock, announcements = []) {
  const provider = resolveProviderFromOrder(order, ipStock);
  const providerKey = normalizeProvider(provider);
  const companyId = resolveCompanyIdFromIpStock(ipStock);

  const live = announcements.filter(
    (item) => item?.status === 'sent' && item.showOnOrderPage === true
  );

  if (companyId) {
    const companyPopup = live.find(
      (item) => announcementCompanyId(item) === String(companyId)
    );
    if (companyPopup) {
      return { popup: companyPopup, match: 'company', provider: providerKey, companyId };
    }
  }

  const providerPopup = live.find((item) => {
    if (!isProviderScopedAnnouncement(item)) return false;
    return normalizeProvider(item.targetProvider) === providerKey;
  });

  if (providerPopup) {
    return { popup: providerPopup, match: 'provider', provider: providerKey, companyId };
  }

  return {
    popup: null,
    match: null,
    provider: providerKey,
    companyId: companyId || null,
  };
}
