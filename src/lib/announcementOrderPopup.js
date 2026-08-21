import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';

const VALID_PROVIDERS = ['advps', 'smartvps', 'hostycare', 'netbay', 'oceanlinux'];

export async function deactivateSiblingOrderPopups(announcement) {
  if (!announcement?.showOnOrderPage) return;

  const filter = {
    showOnOrderPage: true,
    status: 'sent',
    _id: { $ne: announcement._id },
  };

  if (announcement.targetCompany) {
    filter.targetCompany = announcement.targetCompany;
  } else if (announcement.targetProvider) {
    filter.targetProvider = announcement.targetProvider;
    filter.$or = [{ targetCompany: null }, { targetCompany: { $exists: false } }];
  } else {
    return;
  }

  await Announcement.updateMany(filter, { $set: { status: 'draft' } });
}

export function normalizeOrderPopupFields(body = {}) {
  const showOnOrderPage = Boolean(body.showOnOrderPage);
  const targetProvider = showOnOrderPage && body.targetProvider
    ? String(body.targetProvider).toLowerCase()
    : null;
  const targetCompany = showOnOrderPage && body.targetCompany
    ? String(body.targetCompany)
    : null;

  if (showOnOrderPage && !targetProvider && !targetCompany) {
    return { error: 'Order page news requires a provider or company target' };
  }

  if (targetProvider && !VALID_PROVIDERS.includes(targetProvider)) {
    return { error: 'Invalid target provider' };
  }

  return {
    showOnOrderPage,
    targetProvider: targetCompany ? null : targetProvider,
    targetCompany: targetCompany || null,
  };
}

export async function prepareOrderPopupCreate(announcement, status) {
  if (status === 'sent' && announcement.showOnOrderPage) {
    await deactivateSiblingOrderPopups(announcement);
    announcement.sentAt = new Date();
  }
}
