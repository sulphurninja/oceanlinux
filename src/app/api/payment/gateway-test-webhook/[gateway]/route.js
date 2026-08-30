import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import KwikRawLog from '@/models/kwikRawLogModel';
import { logKwikRaw } from '@/lib/kwikRawLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_STORED = 500;

/**
 * Capture-only webhook sink for gateways we are evaluating as KwikUPI replacements.
 *
 * Point a trial gateway's webhook URL here, make a deliberately underpaid payment,
 * and read back what the gateway claims was received. Nothing here touches orders,
 * wallets, or provisioning — it only writes to the diagnostic log.
 *
 * Deliberately unauthenticated, because gateways cannot authenticate to our
 * endpoint. Abuse is bounded by the payload cap, the row cap, and the collection's
 * 30-day TTL. Remove this route once a gateway decision has been made.
 */
export async function POST(request, { params }) {
  await connectDB();

  const gateway = String(params?.gateway || 'unknown').slice(0, 40);

  try {
    const stored = await KwikRawLog.countDocuments({ source: 'external-webhook' });
    if (stored >= MAX_STORED) {
      return NextResponse.json({ success: true, message: 'capture limit reached' });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ success: true, message: 'payload too large to capture' });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody || '{}');
    } catch {
      // Some gateways post form-encoded bodies rather than JSON.
      parsed = Object.fromEntries(new URLSearchParams(rawBody));
    }

    const headers = {};
    request.headers.forEach((value, key) => {
      // Signature headers are useful to see, but only their shape.
      headers[key] = /signature|secret|authorization/i.test(key)
        ? `${String(value).slice(0, 12)}… (len ${value.length})`
        : value;
    });

    await logKwikRaw({
      source: 'external-webhook',
      gateway,
      paymentId: parsed.transaction_id || parsed.payment_id || parsed.intent_id || '',
      orderId: parsed.order_id || parsed.client_txn_id || '',
      reportedStatus: parsed.status || parsed.event || '',
      reportedAmount: parsed.amount,
      headers,
      raw: parsed,
      note: `captured from ${gateway}`,
    });

    // Gateways retry on anything other than 2xx, so always acknowledge.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[gateway-test-webhook] capture failed:', error?.message);
    return NextResponse.json({ success: true });
  }
}

export async function GET(request, { params }) {
  return NextResponse.json({
    success: true,
    message: `Webhook capture endpoint for "${params?.gateway}". POST payloads here and read them in /admin/kwik-test.`,
  });
}
