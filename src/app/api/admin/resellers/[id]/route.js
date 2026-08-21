import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Reseller from '@/models/resellerModel';
import User from '@/models/userModel';
import Order from '@/models/orderModel';
import { enforceAdmin } from '@/lib/apiSecurity';
import { hashUserPassword } from '@/lib/userPassword';
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

        const resellerJson = reseller.toObject({ flattenMaps: true });
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
        const { status, action, phone, businessName, newPassword } = body;

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

        // Password reset — Reseller + linked User (login User se hota hai) dono update
        if (action === 'resetPassword') {
            const pwd = String(newPassword || '').trim();
            if (pwd.length < 6) {
                return NextResponse.json(
                    { success: false, message: 'Password kam se kam 6 characters ka hona chahiye' },
                    { status: 400 }
                );
            }

            const reseller = await Reseller.findById(id);
            if (!reseller) {
                return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
            }

            // .save() se pre-save hook hash karega
            reseller.password = pwd;
            await reseller.save();

            let userUpdated = false;
            const linkedUser = reseller.userId
                ? await User.findById(reseller.userId)
                : await User.findOne({ email: reseller.email });

            if (linkedUser) {
                linkedUser.password = await hashUserPassword(pwd);
                if (!linkedUser.resellerId) linkedUser.resellerId = reseller._id;
                if (linkedUser.userType !== 'reseller') linkedUser.userType = 'reseller';
                await linkedUser.save();
                userUpdated = true;
            }

            return NextResponse.json({
                success: true,
                message: userUpdated
                    ? 'Password reset — reseller ab naye password se login kar sakta hai'
                    : 'Reseller password reset, lekin linked login account nahi mila',
                userUpdated,
            });
        }

        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
