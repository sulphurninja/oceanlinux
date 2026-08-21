import { NextResponse } from 'next/server';
import { validateAPIKey, apiAuthFailure } from '@/lib/api-utils';
import { rebootOrderViaApi } from '@/lib/v1ServerApi';

export async function POST(request, { params }) {
  try {
    const auth = await validateAPIKey(request, { requiredPermission: 'servers:write' });
    if (!auth.success) return apiAuthFailure(auth);

    const orderId = params?.serverId;
    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing server id', message: 'Order id is required in the URL' },
        { status: 400 },
      );
    }

    const result = await rebootOrderViaApi(auth.user, orderId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[V1-REBOOT] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
