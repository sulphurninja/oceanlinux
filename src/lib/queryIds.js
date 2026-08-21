import mongoose from 'mongoose';

/**
 * Mongoose treats a raw object taken from a JSON body as query operators, so a
 * body of `{"orderId": {"$ne": null}}` turns `findOne({ _id: orderId })` into a
 * match against an arbitrary document. Every id that arrives in a request body
 * must pass through one of these before it reaches a query.
 */
export function toObjectIdString(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const str = String(value).trim();
  return mongoose.Types.ObjectId.isValid(str) ? str : null;
}

/** For non-ObjectId lookup keys (slugs, gateway txn ids). */
export function toQueryString(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim();
}
