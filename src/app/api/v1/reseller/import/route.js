import { NextResponse } from 'next/server';
import { authenticateReseller } from '@/lib/resellerAuth';
import connectDB from '@/lib/db';

/** GET /api/v1/reseller/import — importable non-reseller VMs */
export async function GET(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json({
    success: true,
    count: 0,
    importable: [],
    message: 'No importable VMs for this account. Contact support to migrate existing services.',
  });
}

/** POST /api/v1/reseller/import — import VM into reseller program */
export async function POST(request) {
  await connectDB();
  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json(
    {
      success: false,
      message: 'VM import is not available via API yet. Contact OceanLinux support for manual migration.',
    },
    { status: 501 },
  );
}
