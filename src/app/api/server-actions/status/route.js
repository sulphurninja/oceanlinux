import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import ServerActionRequest from '@/models/serverActionRequestModel';

export async function GET(request) {
    await connectDB();

    try {
        // Get user from token
        const userId = await getDataFromToken(request);

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');

        if (!orderId) {
            return NextResponse.json(
                { success: false, message: 'Missing required parameter: orderId' },
                { status: 400 }
            );
        }

        // Find the latest PENDING request for this order
        // Only show pending requests - approved/rejected requests shouldn't block new submissions
        const latestRequest = await ServerActionRequest.findOne({
            orderId,
            userId, // Ensure user owns this order's requests
            status: 'pending' // Only fetch pending requests
        })
            .sort({ requestedAt: -1 })
            .lean();

        if (!latestRequest) {
            return NextResponse.json({
                success: true,
                hasRequest: false,
                request: null
            });
        }

        return NextResponse.json({
            success: true,
            hasRequest: true,
            request: {
                _id: latestRequest._id,
                action: latestRequest.action,
                status: latestRequest.status,
                requestedAt: latestRequest.requestedAt,
                processedAt: latestRequest.processedAt,
                adminNotes: latestRequest.adminNotes
            }
        });

    } catch (error) {
        console.error('[SERVER-ACTION-STATUS] Error fetching status:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch status', error: error.message },
            { status: 500 }
        );
    }
}
