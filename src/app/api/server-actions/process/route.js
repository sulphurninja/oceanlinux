import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import ServerActionRequest from '@/models/serverActionRequestModel';
import Order from '@/models/orderModel';
import User from '@/models/userModel';

export async function POST(request) {
    await connectDB();

    try {
        // Get user from token
        const userId = await getDataFromToken(request);
       

        // Check if user is admin
        const admin = await User.findById(userId);

        const { requestId, action, adminNotes } = await request.json();

        if (!requestId || !action) {
            return NextResponse.json(
                { success: false, message: 'Missing required fields: requestId, action' },
                { status: 400 }
            );
        }

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json(
                { success: false, message: 'Invalid action. Must be "approve" or "reject"' },
                { status: 400 }
            );
        }

        // Find the request
        const actionRequest = await ServerActionRequest.findById(requestId);
        if (!actionRequest) {
            return NextResponse.json(
                { success: false, message: 'Request not found' },
                { status: 404 }
            );
        }

        // Check if already processed
        if (actionRequest.status !== 'pending') {
            return NextResponse.json(
                { success: false, message: `Request already ${actionRequest.status}` },
                { status: 400 }
            );
        }

        // Update request status
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        actionRequest.status = newStatus;
        actionRequest.processedAt = new Date();
        actionRequest.processedBy = userId;
        if (adminNotes) {
            actionRequest.adminNotes = adminNotes;
        }
        await actionRequest.save();

        console.log(`[SERVER-ACTION-PROCESS] Request ${requestId} ${newStatus} by admin ${admin.email}`);

        // If approved, update the order's lastAction
        if (action === 'approve') {
            await Order.findByIdAndUpdate(actionRequest.orderId, {
                lastAction: actionRequest.action,
                lastActionTime: new Date()
            });
            console.log(`[SERVER-ACTION-PROCESS] Updated order ${actionRequest.orderId} with action: ${actionRequest.action}`);
        }

        // TODO: Send notification to customer
        // You can add email notification here using your email service

        return NextResponse.json({
            success: true,
            message: `Request ${newStatus} successfully`,
            request: {
                _id: actionRequest._id,
                status: actionRequest.status,
                processedAt: actionRequest.processedAt
            }
        });

    } catch (error) {
        console.error('[SERVER-ACTION-PROCESS] Error processing request:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to process request', error: error.message },
            { status: 500 }
        );
    }
}
