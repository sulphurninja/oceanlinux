import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import RenewalLog from '@/models/renewalLogModel';
import { getDataFromToken } from '@/helper/getDataFromToken';

// GET - Fetch renewal logs with filtering
export async function GET(request) {
    try {
        await connectDB();

        // Verify admin authentication
        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);

        // Build query filters
        const filters = {};

        const orderId = searchParams.get('orderId');
        if (orderId) {
            filters.orderId = orderId;
        }

        const renewalTxnId = searchParams.get('renewalTxnId');
        if (renewalTxnId) {
            filters.renewalTxnId = renewalTxnId;
        }

        const success = searchParams.get('success');
        if (success !== null && success !== '') {
            filters.success = success === 'true';
        }

        const provider = searchParams.get('provider');
        if (provider) {
            filters['orderContext.provider'] = provider;
        }

        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) {
                filters.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                filters.createdAt.$lte = new Date(endDate);
            }
        }

        // Pagination
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Fetch logs
        const logs = await RenewalLog.find(filters)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset)
            .lean();

        // Get total count for pagination
        const totalCount = await RenewalLog.countDocuments(filters);

        // Calculate summary stats
        const stats = await RenewalLog.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: null,
                    totalAttempts: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: ['$success', 1, 0] }
                    },
                    failureCount: {
                        $sum: { $cond: ['$success', 0, 1] }
                    },
                    avgDuration: { $avg: '$duration' }
                }
            }
        ]);

        const summary = stats[0] || {
            totalAttempts: 0,
            successCount: 0,
            failureCount: 0,
            avgDuration: 0
        };

        return NextResponse.json({
            success: true,
            logs,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: offset + limit < totalCount
            },
            summary
        });

    } catch (error) {
        console.error('[RENEWAL-LOGS-API] Error fetching logs:', error);
        return NextResponse.json(
            { success: false, message: 'Server error', error: error.message },
            { status: 500 }
        );
    }
}
