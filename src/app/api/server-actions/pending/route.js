import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ServerActionRequest from '@/models/serverActionRequestModel';
import { enforceAdmin } from '@/lib/apiSecurity';

export async function GET(request) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'pending';
        const limit = parseInt(searchParams.get('limit') || '50');

        console.log(`[SERVER-ACTION-PENDING] Fetching requests with status: ${status}, limit: ${limit}`);

        const requests = await ServerActionRequest.find({ status })
            .sort({ requestedAt: -1 })
            .limit(limit)
            .populate('userId', 'name email')
            .populate('processedBy', 'name email')
            .lean();

        console.log(`[SERVER-ACTION-PENDING] Found ${requests.length} requests`);

        return NextResponse.json({
            success: true,
            requests,
            count: requests.length
        });

    } catch (error) {
        console.error('[SERVER-ACTION-PENDING] Error fetching requests:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch requests', error: error.message },
            { status: 500 }
        );
    }
}
