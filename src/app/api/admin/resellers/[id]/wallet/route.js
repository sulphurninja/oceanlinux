import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import ResellerWalletService from '@/services/resellerWalletService';

export async function POST(request, { params }) {
    await connectDB();
    const { id } = params;
    const body = await request.json();

    try {
        const { amount, description, type } = body;

        if (type === 'recharge') {
            const result = await ResellerWalletService.recharge(
                id,
                parseFloat(amount),
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
