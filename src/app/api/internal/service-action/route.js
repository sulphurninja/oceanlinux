import { NextResponse } from 'next/server';
import { POST as serviceActionPost, GET as serviceActionGet } from '@/app/api/orders/service-action/route';

function validateInternalKey(request) {
  const key = request.headers.get('x-internal-key');
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || !key || key !== expected) return false;
  return true;
}

/**
 * Internal proxy for Hosthell (and other trusted apps) to run the full
 * OceanLinux service-action pipeline — company Virtualizor, Reseller API,
 * Netbay, Hostycare, SmartVPS, etc. — without a customer JWT cookie.
 *
 * Auth: x-internal-key header must match INTERNAL_API_KEY.
 *
 * POST body: { orderId, action, templateId?, newPassword?, payload? }
 * GET query: ?orderId=...
 */
export async function POST(request) {
  if (!validateInternalKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const internalRequest = new Request('http://internal/api/orders/service-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-bypass': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify(body),
    });
    return await serviceActionPost(internalRequest);
  } catch (error) {
    console.error('[INTERNAL-SERVICE-ACTION] POST error:', error.message);
    return NextResponse.json({ success: false, error: error.message || 'Internal service-action failed' }, { status: 500 });
  }
}

export async function GET(request) {
  if (!validateInternalKey(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId query param required' }, { status: 400 });
    }
    const internalRequest = new Request(`http://internal/api/orders/service-action?orderId=${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        'x-internal-bypass': process.env.INTERNAL_API_KEY || '',
      },
    });
    return await serviceActionGet(internalRequest);
  } catch (error) {
    console.error('[INTERNAL-SERVICE-ACTION] GET error:', error.message);
    return NextResponse.json({ success: false, error: error.message || 'Internal service-action failed' }, { status: 500 });
  }
}
