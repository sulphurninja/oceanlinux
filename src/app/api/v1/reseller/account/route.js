import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { authenticateReseller } from '@/lib/resellerAuth';

export async function GET(request) {
    await connectDB();

    const auth = await authenticateReseller(request);
    if (!auth.success) {
        return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const { reseller } = auth;

    return NextResponse.json({
        success: true,
        account: {
            id: reseller._id,
            businessName: reseller.businessName,
            email: reseller.email,
            status: reseller.status,
            joinedAt: reseller.createdAt
        },
        wallet: {
            balance: reseller.wallet.balance,
            currency: reseller.wallet.currency,
            creditLimit: reseller.wallet.creditLimit
        },
        overview: {
            totalRecharged: reseller.stats?.totalRecharge ?? 0,
            totalSpent: reseller.stats?.totalSpent ?? 0,
            totalOrders: reseller.stats?.totalOrders ?? 0,
            currentBalance: reseller.wallet.balance,
        },
        stats: reseller.stats
    });
}
