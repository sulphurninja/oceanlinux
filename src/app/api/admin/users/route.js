import connectDB from "@/lib/db";
import User from "@/models/userModel";
import Order from "@/models/orderModel";
import Wallet from "@/models/walletModel";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request) {
    try {
        await connectDB();

        const admin = await requireAdmin(request);
        if (!admin) {
            return new Response(JSON.stringify({ message: 'Admin access required' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
        const search = searchParams.get('search');
        const role = searchParams.get('role');
        const status = searchParams.get('status');
        const sortBy = searchParams.get('sortBy') || 'createdAt';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

        let query = {};

        // Search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by role
        if (role && role !== 'all') {
            query.role = role;
        }

        // Filter by verification status
        if (status === 'verified') {
            query.isVerified = true;
        } else if (status === 'unverified') {
            query.isVerified = false;
        }

        const skip = (page - 1) * limit;
        const allowedSort = new Set(['createdAt', 'name', 'email', 'role', 'isVerified']);
        const sortField = allowedSort.has(sortBy) ? sortBy : 'createdAt';

        const [pageUsers, totalUsers] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean()
                .maxTimeMS(10000),
            User.countDocuments(query).maxTimeMS(8000),
        ]);

        const userIds = pageUsers.map((u) => u._id);
        const [orderStats, wallets] = await Promise.all([
            userIds.length
                ? Order.aggregate([
                    { $match: { user: { $in: userIds } } },
                    {
                        $group: {
                            _id: '$user',
                            orderCount: { $sum: 1 },
                            totalSpent: { $sum: { $toDouble: { $ifNull: ['$price', 0] } } },
                            lastOrderDate: { $max: '$createdAt' },
                        },
                    },
                ]).option({ maxTimeMS: 10000 })
                : [],
            userIds.length
                ? Wallet.find({ userId: { $in: userIds } }).select('userId balance').lean().maxTimeMS(8000)
                : [],
        ]);

        const statsByUser = new Map(orderStats.map((row) => [String(row._id), row]));
        const walletByUser = new Map(wallets.map((w) => [String(w.userId), w.balance || 0]));
        const users = pageUsers.map((u) => {
            const stats = statsByUser.get(String(u._id));
            return {
                ...u,
                orderCount: stats?.orderCount || 0,
                totalSpent: stats?.totalSpent || 0,
                lastOrderDate: stats?.lastOrderDate || null,
                walletBalance: walletByUser.get(String(u._id)) || 0,
            };
        });

        const totalPages = Math.ceil(totalUsers / limit);

        return new Response(JSON.stringify({
            users,
            pagination: {
                currentPage: page,
                totalPages,
                totalUsers,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        return new Response(JSON.stringify({ message: 'Failed to fetch users', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function PATCH(request) {
    try {
        await connectDB();

        const admin = await requireAdmin(request);
        if (!admin) {
            return new Response(JSON.stringify({ message: 'Admin access required' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { targetUserId, action, data } = await request.json();

        if (!targetUserId || !action) {
            return new Response(JSON.stringify({ message: 'User ID and action are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const user = await User.findById(targetUserId);
        if (!user) {
            return new Response(JSON.stringify({ message: 'User not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let updateData = {};

        switch (action) {
            case 'verify':
                updateData.isVerified = true;
                updateData.verifiedAt = new Date();
                break;
            case 'unverify':
                updateData.isVerified = false;
                updateData.verifiedAt = null;
                break;
            case 'changeRole':
                if (!data.role || !['User', 'Admin'].includes(data.role)) {
                    return new Response(JSON.stringify({ message: 'Invalid role' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                updateData.role = data.role;
                break;
            case 'updateProfile':
                if (data.name) updateData.name = data.name;
                if (data.email) updateData.email = data.email;
                if (data.phone) updateData.phone = data.phone;
                break;
            default:
                return new Response(JSON.stringify({ message: 'Invalid action' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $set: updateData },
            { new: true, select: '-password' }
        );

        return new Response(JSON.stringify({
            message: `User ${action} successful`,
            user: updatedUser
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error updating user:', error);
        return new Response(JSON.stringify({ message: 'Failed to update user', error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
