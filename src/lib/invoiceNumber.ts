import Order from '@/models/orderModel';
import Counter from '@/models/counterModel';

// Orders placed on/after this instant get sequential invoice numbers.
// 26-Jun-2026 00:00 IST.
const SERIAL_CUTOFF = new Date('2026-06-26T00:00:00+05:30');
const PREFIX = 'OL-';
const PAD = 5;

function legacyNumber(order: any): string {
  return `${PREFIX}${order._id.toString().slice(-8).toUpperCase()}`;
}

async function nextSeq(): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    'invoiceNumber',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return (counter as any).seq as number;
}

/**
 * Return the invoice number for an order, assigning a sequential one on first
 * use for post-cutoff orders. Older orders keep the legacy id-based number.
 * Persists the assigned number on the order so it is stable across downloads.
 */
export async function getOrAssignInvoiceNumber(order: any): Promise<string> {
  if (order?.invoiceNumber) return order.invoiceNumber;

  const created = new Date(order?.createdAt || Date.now());
  if (created < SERIAL_CUTOFF) {
    return legacyNumber(order);
  }

  const seq = await nextSeq();
  const candidate = `${PREFIX}${String(seq).padStart(PAD, '0')}`;

  // Only set it if it has not been assigned by a concurrent request.
  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { invoiceNumber: { $exists: false } },
        { invoiceNumber: null },
        { invoiceNumber: '' },
      ],
    },
    { $set: { invoiceNumber: candidate } },
    { new: true }
  )
    .select('invoiceNumber')
    .lean();

  if (updated && (updated as any).invoiceNumber) {
    return (updated as any).invoiceNumber;
  }

  // Lost the race — read whatever was persisted.
  const fresh = await Order.findById(order._id).select('invoiceNumber').lean();
  return (fresh as any)?.invoiceNumber || candidate;
}

function legacyRenewalNumber(renewal: any): string {
  const raw = String(renewal?.renewalTxnId || renewal?.paymentId || 'RENEWAL');
  return `OLR-${raw.slice(-8).toUpperCase()}`;
}

/**
 * Stable invoice number for one renewal payment. Shares the order sequence
 * so a renewal never reuses a purchase invoice number.
 */
export async function getOrAssignRenewalInvoiceNumber(orderId: any, renewal: any): Promise<string> {
  if (renewal?.invoiceNumber) return renewal.invoiceNumber;

  const paidAt = new Date(renewal?.paidAt || Date.now());
  if (paidAt < SERIAL_CUTOFF) return legacyRenewalNumber(renewal);

  const txnId = String(renewal?.renewalTxnId || '');
  if (!txnId) return legacyRenewalNumber(renewal);

  const seq = await nextSeq();
  const candidate = `${PREFIX}${String(seq).padStart(PAD, '0')}`;

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      renewalPayments: {
        $elemMatch: {
          renewalTxnId: txnId,
          $or: [
            { invoiceNumber: { $exists: false } },
            { invoiceNumber: null },
            { invoiceNumber: '' },
          ],
        },
      },
    },
    { $set: { 'renewalPayments.$.invoiceNumber': candidate } },
    { new: true }
  )
    .select('renewalPayments')
    .lean();

  const saved = (updated as any)?.renewalPayments?.find((row: any) => row.renewalTxnId === txnId);
  if (saved?.invoiceNumber) return saved.invoiceNumber;

  const fresh = await Order.findById(orderId).select('renewalPayments').lean();
  const again = (fresh as any)?.renewalPayments?.find((row: any) => row.renewalTxnId === txnId);
  return again?.invoiceNumber || candidate;
}
