import crypto from 'crypto';
import User from '@/models/userModel';
import Order from '@/models/orderModel';
import { WhatsappBroadcastAccount } from '@/models/whatsappBroadcastModel';

const Zaptick = require('zaptick').default || require('zaptick');

export const BROADCAST_SLOTS = [1, 2, 3, 4, 5, 6, 7];

/** Pacing: ~1 message/second, small batches per process call. */
export const SEND_INTERVAL_MS = 1100;
export const PROCESS_BATCH_SIZE = 8;
/** A running job whose lock is older than this is considered stale. */
export const STALE_LOCK_MS = 90 * 1000;

/** Order statuses that count as "made a purchase". */
export const PURCHASED_STATUSES = ['confirmed', 'paid', 'completed', 'active'];

/**
 * Normalize a raw phone into E.164 (+<digits>) or return null when invalid.
 * Indian 10-digit mobiles (6-9 prefix) get +91; numbers already carrying a
 * country code are kept as-is.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // Strip national trunk prefix (e.g. 09876543210).
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) {
    return `+${digits}`;
  }
  // Other international numbers with a country code.
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function maskApiKey(key) {
  if (!key) return '';
  const str = String(key);
  if (str.length <= 10) return `${str.slice(0, 2)}••••`;
  return `${str.slice(0, 8)}••••${str.slice(-4)}`;
}

export function accountFingerprint(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 24);
}

export function getDefaultApiKey() {
  return process.env.ZAPTICK_API_KEY || '';
}

/**
 * Resolve the effective API key for a slot.
 * Slot 1 falls back to the default platform key when no custom key is saved.
 */
export async function resolveSlotApiKey(slot) {
  const doc = await WhatsappBroadcastAccount.findOne({ slot }).lean();
  if (doc?.apiKey) {
    return { apiKey: doc.apiKey, label: doc.label || `Account ${slot}`, usingDefault: false };
  }
  if (slot === 1) {
    const def = getDefaultApiKey();
    if (def) {
      return { apiKey: def, label: doc?.label || 'Default (platform)', usingDefault: true };
    }
  }
  return { apiKey: null, label: doc?.label || '', usingDefault: false };
}

export function createZaptickClient(apiKey) {
  return new Zaptick(apiKey);
}

/**
 * Build the deduped recipient list for an audience.
 * - 'purchasers': users with at least one paid order, any time.
 * - 'all': every user with a valid phone number.
 * Dedupes by normalized phone (first user wins).
 */
export async function buildAudience(audience) {
  let users;
  if (audience === 'purchasers') {
    const buyerIds = await Order.distinct('user', {
      status: { $in: PURCHASED_STATUSES },
    });
    users = await User.find({
      _id: { $in: buyerIds },
      phone: { $nin: [null, ''] },
    })
      .select('name phone')
      .lean();
  } else {
    users = await User.find({ phone: { $nin: [null, ''] } })
      .select('name phone')
      .lean();
  }

  const seen = new Set();
  const recipients = [];
  for (const u of users) {
    const phone = normalizePhone(u.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    recipients.push({ phone, name: u.name || '', userId: u._id });
  }
  return recipients;
}
