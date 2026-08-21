import QRCode from 'qrcode';
import { fetchKwikUpiUpiLink } from '@/lib/kwikUpi';

/**
 * KwikUPI payment page se upi:// link nikaal ke OceanLinux par inline QR banata hai
 * (reseller wallet recharge jaisa — koi dusri website/tab nahi).
 */
export async function buildKwikUpiInlineQr(paymentPage) {
  if (!paymentPage) {
    return { upiLink: '', qrImageUrl: '' };
  }

  const upiLink = await fetchKwikUpiUpiLink(paymentPage);
  const qrSource = upiLink || paymentPage;
  let qrImageUrl = '';

  if (qrSource) {
    try {
      qrImageUrl = await QRCode.toDataURL(qrSource, { width: 320, margin: 1 });
    } catch {
      qrImageUrl = '';
    }
  }

  return { upiLink, qrImageUrl };
}
