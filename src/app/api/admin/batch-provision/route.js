import { NextResponse } from 'next/server';
import { enforceAdmin } from '@/lib/apiSecurity';

export async function POST(request) {
  const denied = await enforceAdmin(request);
  if (denied) return denied;

  try {
    console.log('Admin triggered batch auto-provisioning');

    // Call the batch provisioning endpoint
    const cronSecret = process.env.CRON_SECRET;
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/orders/auto-provision-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Batch provisioning triggered successfully',
      data: result
    });

  } catch (error) {
    console.error('Admin batch provision error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to trigger batch provisioning',
        error: error.message
      },
      { status: 500 }
    );
  }
}
