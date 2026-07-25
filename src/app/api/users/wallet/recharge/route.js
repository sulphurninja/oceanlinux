import { NextResponse } from 'next/server';

/** @deprecated Use POST /api/wallet/recharge/initiate instead. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: 'This endpoint is deprecated. Use POST /api/wallet/recharge/initiate instead.',
      code: 'DEPRECATED_ENDPOINT',
    },
    { status: 410 }
  );
}

export async function GET() {
  return POST();
}
