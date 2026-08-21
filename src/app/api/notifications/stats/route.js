import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import Notification from '@/models/notificationModel';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Get basic counts
        const totalCount = await Notification.countDocuments({ userId });
        const unreadCount = await Notification.countDocuments({ userId, read: false });
        const readCount = totalCount - unreadCount;

        // Get priority distribution
        const priorityStats = await Notification.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get type distribution
        const typeStats = await Notification.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentCount = await Notification.countDocuments({
            userId,
            createdAt: { $gte: sevenDaysAgo }
        });

        // Format priority stats
        const priorityData = {
            urgent: 0,
            high: 0,
            medium: 0,
            low: 0
        };

        priorityStats.forEach(stat => {
            priorityData[stat._id] = stat.count;
        });

        // Format type stats
        const typeData = {};
        typeStats.forEach(stat => {
            typeData[stat._id] = stat.count;
        });

        return NextResponse.json({
            total: totalCount,
            unread: unreadCount,
            read: readCount,
            recentCount,
            priority: priorityData,
            types: typeData,
            readPercentage: totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0
        });

    } catch (error) {
        console.error('Error fetching notification stats:', error);
        return NextResponse.json(
            { message: 'Failed to fetch notification stats', error: error.message },
            { status: 500 }
        );
    }
}
