import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import Order from '@/models/orderModel';

export async function GET(request, { params }) {
    await connectDB();
    const { id } = params;

    try {
        const reseller = await Reseller.findById(id).select('-password');
        if (!reseller) {
            return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
        }

        // Calculate real-time stats
        const totalOrders = await Order.countDocuments({ resellerId: id });
        const orders = await Order.find({ resellerId: id }).sort({ createdAt: -1 }).limit(5);

        return NextResponse.json({
            success: true,
            reseller,
            stats: {
                totalOrders,
                walletBalance: reseller.wallet.balance
            },
            recentOrders: orders
        });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    await connectDB();
    const { id } = params;
    const body = await request.json();

    try {
        const { status, action, phone, businessName } = body;

        // Status update
        if (action === 'updateStatus') {
            const reseller = await Reseller.findByIdAndUpdate(
                id,
                { status },
                { new: true }
            ).select('-password');
            return NextResponse.json({ success: true, reseller });
        }

        // Profile update
        if (action === 'updateProfile') {
            const reseller = await Reseller.findByIdAndUpdate(
                id,
                { phone, businessName },
                { new: true }
            ).select('-password');
            return NextResponse.json({ success: true, reseller });
        }

        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
