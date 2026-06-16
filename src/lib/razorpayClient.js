import Razorpay from 'razorpay';

let cachedClient = null;

export function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  if (!cachedClient) {
    cachedClient = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return cachedClient;
}
