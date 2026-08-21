import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import User from '@/models/userModel';
import Wallet from '@/models/walletModel';

export async function GET(request) {
    try {
        await connectDB();

        const userId = await getDataFromToken(request);
        if (!userId) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        let wallet = await Wallet.findOne({ userId }).lean();

        if (!wallet) {
            // Create wallet if doesn't exist
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();

            // Update user with wallet reference
            await User.findByIdAndUpdate(userId, { walletId: wallet._id });
        }

        // Get recent transactions (last 50)
        const recentTransactions = wallet.transactions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50);

        return NextResponse.json({
            balance: wallet.balance,
            currency: wallet.currency,
            totalCredits: wallet.totalCredits,
            totalDebits: wallet.totalDebits,
            transactions: recentTransactions,
            isActive: wallet.isActive
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        return NextResponse.json(
            { message: 'Failed to fetch wallet', error: error.message },
            { status: 500 }
        );
    }
}

/**
 * Legacy mutable wallet endpoint. The old read-modify-write path raced with
 * the atomic userWalletService used by checkout and could restore a stale
 * higher balance after a real purchase. Mutations go through:
 *   - /api/wallet/recharge/* (customer top-ups)
 *   - userWalletService (checkout / refunds)
 *   - admin wallet routes (admin credits)
 */
export async function POST() {
    return NextResponse.json(
        {
            message: 'This wallet mutation endpoint has been retired. Use /api/wallet/recharge for top-ups.',
            code: 'WALLET_POST_RETIRED',
        },
        { status: 410 }
    );
}
