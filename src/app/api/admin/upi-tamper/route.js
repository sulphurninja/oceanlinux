import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { enforceAdmin } from '@/lib/apiSecurity';
import { fetchKwikUpiUpiLink } from '@/lib/kwikUpi';

export const dynamic = 'force-dynamic';

/**
 * Builds an underpaying QR from any gateway's payment page or UPI intent link.
 *
 * Used to check whether a candidate gateway reports the amount that actually
 * settled or merely echoes the amount we requested — the flaw that lets customers
 * pay ₹1 for a full-price VPS on KwikUPI.
 */
export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const input = String(body?.link || '').trim();
    const payAmount = Math.max(1, Number(body?.payAmount) || 1);

    if (!input) {
      return NextResponse.json({ success: false, message: 'Paste a payment page URL or upi:// link' }, { status: 400 });
    }

    let upiLink = '';
    if (/^upi:\/\//i.test(input)) {
      upiLink = input;
    } else if (/^https?:\/\//i.test(input)) {
      upiLink = await fetchKwikUpiUpiLink(input);
      if (!upiLink) {
        return NextResponse.json(
          { success: false, message: 'No upi:// link found on that page. Open it, scan its QR with a QR reader, and paste the upi:// text instead.' },
          { status: 422 }
        );
      }
    } else {
      return NextResponse.json({ success: false, message: 'Not a URL or a upi:// link' }, { status: 400 });
    }

    const amMatch = upiLink.match(/[?&]am=([^&]*)/i);
    if (!amMatch) {
      return NextResponse.json(
        { success: false, message: 'This link has no am= parameter — the amount may be locked by the gateway (a good sign).' },
        { status: 422 }
      );
    }

    const originalAmount = amMatch[1];
    const tamperedUpiLink = upiLink.replace(/([?&]am=)[^&]*/i, `$1${payAmount.toFixed(2)}`);

    const [qrImageUrl, tamperedQrImageUrl] = await Promise.all([
      QRCode.toDataURL(upiLink, { width: 320, margin: 1 }).catch(() => ''),
      QRCode.toDataURL(tamperedUpiLink, { width: 320, margin: 1 }).catch(() => ''),
    ]);

    return NextResponse.json({
      success: true,
      originalAmount,
      payAmount,
      upiLink,
      tamperedUpiLink,
      qrImageUrl,
      tamperedQrImageUrl,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
