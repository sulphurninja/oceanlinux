import { getRazorpayClient } from '@/lib/razorpayClient';

/**
 * payment.captured often omits order receipt — fetch from Razorpay order API.
 */
export async function resolveRazorpayReceipt({ paymentEntity, orderEntity, razorpayOrderId }) {
  let receipt = orderEntity?.receipt || paymentEntity?.notes?.receipt || '';
  receipt = String(receipt || '').trim();

  const orderId = String(
    razorpayOrderId || paymentEntity?.order_id || orderEntity?.id || ''
  ).trim();

  if (receipt.startsWith('RENEWAL_') || !orderId) {
    return receipt;
  }

  try {
    const razorpay = getRazorpayClient();
    if (!razorpay) return receipt;
    const fetched = await razorpay.orders.fetch(orderId);
    if (fetched?.receipt) {
      return String(fetched.receipt).trim();
    }
  } catch (err) {
    console.warn('[razorpayWebhookReceipt] order fetch failed:', err.message);
  }

  return receipt;
}
