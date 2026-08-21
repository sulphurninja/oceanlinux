import { NextResponse } from 'next/server';
import { validateAPIKey, apiAuthFailure } from '@/lib/api-utils';
import { purchaseServerViaApi } from '@/lib/v1ServerApi';

export async function POST(request) {
  try {
    const auth = await validateAPIKey(request, { requiredPermission: 'servers:write' });
    if (!auth.success) return apiAuthFailure(auth);

    const body = await request.json();
    const result = await purchaseServerViaApi(auth.user, body);

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[V1-PURCHASE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
