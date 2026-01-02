import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import ServerActionRequest from '@/models/serverActionRequestModel';
import User from '@/models/userModel';

export async function GET(request) {
    await connectDB();

    try {
        // Get user from token
        const userId = await getDataFromToken(request);
        

        // Check if user is admin
        const user = await User.findById(userId);
        

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'pending';
        const limit = parseInt(searchParams.get('limit') || '50');

        console.log(`[SERVER-ACTION-PENDING] Fetching requests with status: ${status}, limit: ${limit}`);

        // Fetch requests
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
