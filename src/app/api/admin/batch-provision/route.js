import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('Admin triggered batch auto-provisioning');

    // Call the batch provisioning endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/orders/auto-provision-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
