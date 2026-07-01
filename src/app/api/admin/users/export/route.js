import connectDB from "@/lib/db";
import User from "@/models/userModel";
import Order from "@/models/orderModel";
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request) {
    try {
        await connectDB();

        const admin = await requireAdmin(request);
        if (!admin) {
            return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'json';
        const includeOrders = searchParams.get('includeOrders') === 'true';

        let usersData;

        if (includeOrders) {
            usersData = await User.aggregate([
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
                        }
                    }
                },
                { $project: { password: 0 } }
            ]);
        } else {
            usersData = await User.find({}, { password: 0 }).lean();
        }

        if (format === 'csv') {
            // Generate CSV
            const headers = ['ID', 'Name', 'Email', 'Phone', 'Role', 'Verified', 'Created At'];
            if (includeOrders) {
                headers.push('Order Count', 'Total Spent');
            }

            const csvData = [
                headers.join(','),
                ...usersData.map(user => {
                    const row = [
                        user._id,
                        `"${user.name}"`,
                        user.email,
                        user.phone || '',
                        user.role,
                        user.isVerified ? 'Yes' : 'No',
                        new Date(user.createdAt).toISOString()
                    ];
                    if (includeOrders) {
                        row.push(user.orderCount || 0, user.totalSpent || 0);
                    }
                    return row.join(',');
                })
            ].join('\n');

            return new NextResponse(csvData, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.csv"`
                }
            });
        }

        // Return JSON format
        return NextResponse.json(usersData, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.json"`
            }
        });

    } catch (error) {
        console.error('Error exporting users:', error);
        return NextResponse.json({ message: 'Failed to export users' }, { status: 500 });
    }
}
