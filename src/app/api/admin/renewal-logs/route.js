import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import RenewalLog from '@/models/renewalLogModel';
import Order from '@/models/orderModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { buildRenewalLogStatusFilter, getRenewalLogApiStatus } from '@/lib/renewalLogStatus';

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET - Fetch renewal logs with filtering
export async function GET(request) {
    try {
        const denied = await enforceAdmin(request);
        if (denied) return denied;

        await connectDB();

        const { searchParams } = new URL(request.url);

        const filters = {};
        const andConditions = [];

        const orderId = searchParams.get('orderId')?.trim();
        if (orderId) {
            andConditions.push({ orderId });
        }

        const renewalTxnId = searchParams.get('renewalTxnId')?.trim();
        if (renewalTxnId) {
            andConditions.push({
                renewalTxnId: { $regex: escapeRegex(renewalTxnId), $options: 'i' },
            });
        }

        const ip = searchParams.get('ip')?.trim();
        if (ip) {
            andConditions.push({
                'orderContext.ipAddress': { $regex: escapeRegex(ip), $options: 'i' },
            });
        }

        const gatewayOrderId = searchParams.get('gatewayOrderId')?.trim();
        if (gatewayOrderId) {
            const gatewayRegex = { $regex: escapeRegex(gatewayOrderId), $options: 'i' };
            const matchingOrders = await Order.find({
                $or: [
                    { gatewayOrderId: gatewayRegex },
                    { 'renewalPayments.gatewayOrderId': gatewayRegex },
                    { 'pendingRenewal.gatewayOrderId': gatewayRegex },
                ],
            })
                .select('_id')
                .lean();

            const orderIds = matchingOrders.map((o) => o._id);
            andConditions.push({
                $or: [
                    { 'paymentInfo.gatewayOrderId': gatewayRegex },
                    { 'paymentInfo.paymentId': gatewayRegex },
                    { renewalTxnId: gatewayRegex },
                    ...(orderIds.length ? [{ orderId: { $in: orderIds } }] : []),
                ],
            });
        }

        const provider = searchParams.get('provider');
        if (provider && provider !== 'all') {
            andConditions.push({ 'orderContext.provider': provider });
        }

        const apiStatus = searchParams.get('apiStatus') || searchParams.get('status');
        const statusFilter = buildRenewalLogStatusFilter(apiStatus);
        if (statusFilter) {
            andConditions.push(statusFilter);
        }

        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        if (startDate || endDate) {
            const createdAt = {};
            if (startDate) createdAt.$gte = new Date(startDate);
            if (endDate) createdAt.$lte = new Date(endDate);
            andConditions.push({ createdAt });
        }

        if (andConditions.length === 1) {
            Object.assign(filters, andConditions[0]);
        } else if (andConditions.length > 1) {
            filters.$and = andConditions;
        }

        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const logs = await RenewalLog.find(filters)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset)
            .lean();

        const totalCount = await RenewalLog.countDocuments(filters);

        const allForSummary = await RenewalLog.find(filters).select(
            'success providerApiResult manualConfirmedAt'
        ).lean();

        let apiSuccessCount = 0;
        let apiFailedCount = 0;
        let manualConfirmedCount = 0;
        let paymentOnlySuccessCount = 0;

        for (const log of allForSummary) {
            const status = getRenewalLogApiStatus(log);
            if (status === 'manual_confirmed') manualConfirmedCount += 1;
            else if (status === 'api_success') apiSuccessCount += 1;
            else if (status === 'api_failed') apiFailedCount += 1;
            else if (status === 'payment_success') paymentOnlySuccessCount += 1;
        }

        const durationStats = await RenewalLog.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: null,
                    avgDuration: { $avg: '$duration' },
                },
            },
        ]);

        const summary = {
            totalAttempts: allForSummary.length,
            apiSuccessCount,
            apiFailedCount,
            manualConfirmedCount,
            paymentOnlySuccessCount,
            successCount: apiSuccessCount + paymentOnlySuccessCount + manualConfirmedCount,
            failureCount: apiFailedCount,
            avgDuration: durationStats[0]?.avgDuration || 0,
        };

        const enrichedLogs = logs.map((log) => ({
            ...log,
            apiStatus: getRenewalLogApiStatus(log),
        }));

        return NextResponse.json({
            success: true,
            logs: enrichedLogs,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: offset + limit < totalCount,
            },
            summary,
        });
    } catch (error) {
        console.error('[RENEWAL-LOGS-API] Error fetching logs:', error);
        return NextResponse.json(
            { success: false, message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}
