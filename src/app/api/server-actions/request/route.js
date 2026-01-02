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
       

        const { orderId, action, payload } = await request.json();

        if (!orderId || !action) {
            return NextResponse.json(
                { success: false, message: 'Missing required fields: orderId, action' },
                { status: 400 }
            );
        }

        // Validate action
        const validActions = ['start', 'stop', 'restart', 'format', 'changepassword', 'reinstall'];
        if (!validActions.includes(action)) {
            return NextResponse.json(
                { success: false, message: `Invalid action. Must be one of: ${validActions.join(', ')}` },
                { status: 400 }
            );
        }

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return NextResponse.json(
                { success: false, message: 'Order not found' },
                { status: 404 }
            );
        }

        // Verify user owns this order
        if (order.user.toString() !== userId) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized to request actions for this order' },
                { status: 403 }
            );
        }

        // Check if order is auto-provisioned (Hostycare or SmartVPS with service IDs)
        // Only allow manual requests for non-auto-provisioned products
        // Orders with provider='oceanlinux' OR orders without hostycareServiceId/smartvpsServiceId are manual
        const isAutoProvisioned = (
            (order.provider === 'hostycare' && order.hostycareServiceId) ||
            (order.provider === 'smartvps' && (order.smartvpsServiceId || order.ipAddress))
        );

        if (isAutoProvisioned) {
            return NextResponse.json(
                { success: false, message: 'This order supports direct server actions. Please use the action buttons instead.' },
                { status: 400 }
            );
        }

        // Check for existing pending request for this order+action
        const existingRequest = await ServerActionRequest.findOne({
            orderId,
            action,
            status: 'pending'
        });

        if (existingRequest) {
            return NextResponse.json(
                { success: false, message: `A pending ${action} request already exists for this order` },
                { status: 400 }
            );
        }

        // Get user details for snapshot
        const user = await User.findById(userId);

        // Create order snapshot for admin reference
        const orderSnapshot = {
            productName: order.productName,
            ipAddress: order.ipAddress || 'Not assigned',
            customerEmail: user?.email || 'Unknown',
            customerName: user?.name || 'Unknown',
            os: order.os || 'Unknown',
            memory: order.memory || 'Unknown'
        };

        // Create the action request
        const actionRequest = await ServerActionRequest.create({
            orderId,
            userId,
            action,
            status: 'pending',
            payload: payload || {},
            orderSnapshot,
            requestedAt: new Date()
        });

        console.log(`[SERVER-ACTION-REQUEST] Created request: ${actionRequest._id} for order ${orderId}, action: ${action}`);

        return NextResponse.json({
            success: true,
            requestId: actionRequest._id,
            message: 'Action request submitted successfully. An admin will review it shortly.'
        });

    } catch (error) {
        console.error('[SERVER-ACTION-REQUEST] Error creating request:', error);

        // Handle duplicate key error (race condition)
        if (error.code === 11000) {
            return NextResponse.json(
                { success: false, message: 'A pending request for this action already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { success: false, message: 'Failed to create action request', error: error.message },
            { status: 500 }
        );
    }
}
