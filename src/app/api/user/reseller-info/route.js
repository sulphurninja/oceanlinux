import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import Reseller from '@/models/resellerModel';
import Order from '@/models/orderModel';
import { getDataFromToken } from '@/helper/getDataFromToken';
import {
    RESELLER_TXN_HISTORY_DAYS,
    fetchEnrichedWalletTransactions,
} from '@/lib/resellerWalletTransactions';

export async function GET(request) {
    await connectDB();

    try {
        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const user = await User.findById(userId).select('name email userType resellerId').lean();

        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        if (user.userType !== 'reseller' || !user.resellerId) {
            return NextResponse.json({ success: false, message: 'Not a reseller' }, { status: 403 });
        }

        const lite = new URL(request.url).searchParams.get('lite') === '1';
        if (lite) {
            const reseller = await Reseller.findById(user.resellerId)
                .select('businessName email phone status isVerified apiKey apiSecret apiUsage wallet.balance wallet.currency wallet.creditLimit wallet.minBalance stats whitelabel')
                .lean();
            if (!reseller) {
                return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
            }
            return NextResponse.json({
                success: true,
                data: {
                    user: { name: user.name, email: user.email },
                    reseller: {
                        ...reseller,
                        wallet: { ...(reseller.wallet || {}), transactions: [] },
                    },
                    walletTransactions: [],
                    recentOrders: [],
                    transactionHistoryDays: RESELLER_TXN_HISTORY_DAYS,
                },
            });
        }

        const reseller = await Reseller.findById(user.resellerId)
            .select('-password -pricing');

        if (!reseller) {
            return NextResponse.json({ success: false, message: 'Reseller not found' }, { status: 404 });
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RESELLER_TXN_HISTORY_DAYS);

        const [walletTransactions, recentOrders] = await Promise.all([
            fetchEnrichedWalletTransactions(reseller),
            Order.find({
                resellerId: user.resellerId,
                createdAt: { $gte: cutoff },
            })
                .sort({ createdAt: -1 })
                .select(
                    'productName memory price status ipAddress transactionId clientTxnId gatewayOrderId paymentMethod os provisioningStatus expiryDate createdAt'
                )
                .lean(),
        ]);

        const resellerJson = reseller.toObject();
        resellerJson.wallet = {
            ...resellerJson.wallet,
            transactions: walletTransactions,
        };

        return NextResponse.json({
            success: true,
            data: {
                user: {
                    name: user.name,
                    email: user.email,
                },
                reseller: resellerJson,
                walletTransactions,
                recentOrders,
                transactionHistoryDays: RESELLER_TXN_HISTORY_DAYS,
            },
        });

    } catch (error) {
        console.error('Error fetching reseller info:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
