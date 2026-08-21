import connectDB from '@/lib/db';
import Announcement from '@/models/announcementModel';
import AnnouncementEngagement from '@/models/announcementEngagementModel';
import { toObjectIdString } from '@/lib/queryIds';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export { TRANSPARENT_GIF };

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'https://oceanlinux.com').replace(/\/$/, '');
}

export function buildAnnouncementOpenPixelUrl(announcementId, userId) {
  const a = toObjectIdString(announcementId);
  const u = toObjectIdString(userId);
  if (!a || !u) return null;
  return `${appBaseUrl()}/api/announcements/track/open?a=${a}&u=${u}`;
}

export function buildAnnouncementClickUrl(announcementId, userId, destinationUrl) {
  const a = toObjectIdString(announcementId);
  const u = toObjectIdString(userId);
  if (!a || !u || !destinationUrl) return null;
  return `${appBaseUrl()}/api/announcements/track/click?a=${a}&u=${u}&to=${encodeURIComponent(destinationUrl)}`;
}

/** Only allow redirects to our site (prevents open-redirect abuse). */
export function isSafeAnnouncementRedirect(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'oceanlinux.com' ||
      host === 'www.oceanlinux.com' ||
      host.endsWith('.oceanlinux.com')
    );
  } catch {
    return false;
  }
}

export function resolveAnnouncementRedirect(toParam) {
  if (!toParam) return `${appBaseUrl()}/dashboard`;
  const decoded = decodeURIComponent(toParam);
  if (decoded.startsWith('/') && !decoded.startsWith('//')) {
    return `${appBaseUrl()}${decoded}`;
  }
  if (isSafeAnnouncementRedirect(decoded)) return decoded;
  return `${appBaseUrl()}/dashboard`;
}

export async function recordAnnouncementEmailOpen(announcementId, userId) {
  const a = toObjectIdString(announcementId);
  const u = toObjectIdString(userId);
  if (!a || !u) return { recorded: false };

  await connectDB();

  const existing = await AnnouncementEngagement.findOne({
    announcementId: a,
    userId: u,
    emailOpened: true,
  }).lean();

  if (existing) return { recorded: false };

  await AnnouncementEngagement.updateOne(
    { announcementId: a, userId: u },
    {
      $set: { emailOpened: true, emailOpenedAt: new Date() },
      $setOnInsert: { linkClicked: false },
    },
    { upsert: true }
  );

  await Announcement.updateOne({ _id: a, status: 'sent' }, { $inc: { openCount: 1 } });
  return { recorded: true };
}

export async function recordAnnouncementLinkClick(announcementId, userId) {
  const a = toObjectIdString(announcementId);
  const u = toObjectIdString(userId);
  if (!a || !u) return { recorded: false };

  await connectDB();

  const existing = await AnnouncementEngagement.findOne({
    announcementId: a,
    userId: u,
    linkClicked: true,
  }).lean();

  if (existing) return { recorded: false };

  await AnnouncementEngagement.updateOne(
    { announcementId: a, userId: u },
    {
      $set: { linkClicked: true, linkClickedAt: new Date() },
      $setOnInsert: { emailOpened: false },
    },
    { upsert: true }
  );

  await Announcement.updateOne({ _id: a, status: 'sent' }, { $inc: { clickCount: 1 } });
  return { recorded: true };
}
