import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { authenticateReseller } from '@/lib/resellerAuth';

/** GET /api/v1/reseller/addons — IP rotation quota + packs */
export async function GET(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json({
    success: true,
    rotation: {
      quotaRemaining: 0,
      packs: [],
    },
    message: 'IP rotation add-ons are not enabled on this account yet.',
  });
}

/** POST /api/v1/reseller/addons — buy rotation pack */
export async function POST(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json(
    {
      success: false,
      message: 'Buying rotation packs via API is not enabled yet.',
    },
    { status: 501 },
  );
}
