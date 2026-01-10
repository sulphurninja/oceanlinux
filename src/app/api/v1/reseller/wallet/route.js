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

    // Return last 50 transactions
    // The transactions are stored in the reseller document, so we just map them
    const transactions = (reseller.wallet.transactions || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);

    return NextResponse.json({
        success: true,
        transactions
    });
}
