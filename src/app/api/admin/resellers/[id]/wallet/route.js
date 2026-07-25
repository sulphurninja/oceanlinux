import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ResellerWalletService from '@/services/resellerWalletService';
import { enforceAdmin } from '@/lib/apiSecurity';

export async function POST(request, { params }) {
    const denied = await enforceAdmin(request);
    if (denied) return denied;

    await connectDB();
    const { id } = params;
    const body = await request.json();

    try {
        const { amount, description, type } = body;

        // Unvalidated parseFloat lets a typo (or 'abc') write NaN into the
        // balance, and a negative value silently drains the wallet.
        const parsedAmount = parseFloat(amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json(
                { success: false, message: 'Amount must be a positive number' },
                { status: 400 }
            );
        }

        if (type === 'recharge') {
            const result = await ResellerWalletService.recharge(
                id,
                parsedAmount,
                description || 'Manual recharge by admin',
                { source: 'admin_panel' }
            );

            return NextResponse.json({
                success: true,
                newBalance: result.newBalance,
                message: 'Wallet recharged successfully'
            });
        }

        return NextResponse.json({ success: false, message: 'Invalid transaction type' }, { status: 400 });

    } catch (error) {
        console.error('Wallet error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
