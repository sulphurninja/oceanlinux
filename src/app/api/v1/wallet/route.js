import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import userWalletService from '@/services/userWalletService';
import { validateAPIKey, apiAuthFailure } from '@/lib/api-utils';

export async function GET(request) {
  try {
    await connectDB();

    const auth = await validateAPIKey(request, { requiredPermission: 'wallet:read' });
    if (!auth.success) return apiAuthFailure(auth);

    const wallet = await userWalletService.getOrCreateWallet(auth.user._id);
    const transactions = await userWalletService.listTransactions(auth.user._id, { limit: 50 });

    return NextResponse.json({
      balance: wallet.balance ?? 0,
      currency: wallet.currency ?? 'INR',
      totalCredits: wallet.totalCredits ?? 0,
      totalDebits: wallet.totalDebits ?? 0,
      transactions,
      isActive: wallet.isActive !== false,
    });
  } catch (error) {
    console.error('[V1-WALLET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}
