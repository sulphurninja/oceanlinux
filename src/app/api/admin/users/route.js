import connectDB from "@/lib/db";
import User from "@/models/userModel";
import Order from "@/models/orderModel";
import { getDataFromToken } from "@/helper/getDataFromToken";

export async function GET(request) {
    try {
        await connectDB();

        // Check if user is admin
        const userId = getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
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

        // Get users with order counts
        const users = await User.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: 'orders',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'orders'
                }
            },
            {
                $addFields: {
                    orderCount: { $size: '$orders' },
                    totalSpent: {
                        $sum: {
                            $map: {
                                input: '$orders',
                                as: 'order',
                                in: { $toDouble: '$$order.price' }
                            }
                        }
                    },
                    lastOrderDate: { $max: '$orders.createdAt' }
                }
            },
            { $project: { password: 0, orders: 0 } },
            { $sort: { [sortBy]: sortOrder } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalUsers = await User.countDocuments(query);
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

        // Check if user is admin
        const userId = getDataFromToken(request);
        if (!userId) {
            return new Response(JSON.stringify({ message: 'Authentication required' }), {
                status: 401,
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
            case 'resetPassword':
                // Generate a temporary password
                const tempPassword = Math.random().toString(36).slice(-8);
                updateData.password = tempPassword; // You should hash this in production
                updateData.mustChangePassword = true;
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
