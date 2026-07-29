import mongoose from 'mongoose';

/** Match tickets for a user whether userId was stored as ObjectId or string. */
export function buildUserTicketFilter(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return { userId: null };

  const clauses = [{ userId: uid }];
  if (mongoose.Types.ObjectId.isValid(uid)) {
    clauses.push({ userId: new mongoose.Types.ObjectId(uid) });
  }
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

export function markTicketReadByUserUpdate() {
  return {
    hasUnreadAdminReply: false,
    userLastReadAt: new Date(),
  };
}

export function markTicketAdminReplyUnreadUpdate() {
  return { hasUnreadAdminReply: true };
}
