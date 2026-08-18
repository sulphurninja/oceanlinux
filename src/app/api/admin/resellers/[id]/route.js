import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import Order from '@/models/orderModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import {
    RESELLER_TXN_HISTORY_DAYS,
    fetchEnrichedWalletTransactions,
} from '@/lib/resellerWalletTransactions';

export async function GET(request, { params }) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();
    const { id } = params;

    try {
        const reseller = await Reseller.findById(id).select('-password');
        if (!reseller) {
            return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RESELLER_TXN_HISTORY_DAYS);

        const totalOrders = await Order.countDocuments({ resellerId: id });

        const recentOrders = await Order.find({
            resellerId: id,
            createdAt: { $gte: cutoff },
        })
            .sort({ createdAt: -1 })
            .select(
                'productName memory price status ipAddress transactionId clientTxnId gatewayOrderId paymentMethod os provisioningStatus expiryDate createdAt'
            )
            .lean();

        const walletTransactions = await fetchEnrichedWalletTransactions(reseller);

        const resellerJson = reseller.toObject();
        resellerJson.wallet = {
            ...resellerJson.wallet,
            transactions: walletTransactions,
        };

        return NextResponse.json({
            success: true,
            reseller: resellerJson,
            stats: {
                totalOrders,
                walletBalance: reseller.wallet.balance,
            },
            recentOrders,
            walletTransactions,
            transactionHistoryDays: RESELLER_TXN_HISTORY_DAYS,
        });
    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

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
