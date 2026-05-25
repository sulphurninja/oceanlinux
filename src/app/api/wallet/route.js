import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { getDataFromToken } from '@/helper/getDataFromToken';
import userWalletService from '@/services/userWalletService';
import WalletRecharge from '@/models/walletRechargeModel';

/**
 * GET /api/wallet
 *
 * Customer wallet endpoint that returns balance + last 50 transactions
 * + recent recharge attempts. The legacy [src/app/api/users/wallet/route.js]
 * stays untouched for back-compat.
 */
export async function GET(request) {
  await connectDB();
  let userId;
  try {
    userId = await getDataFromToken(request);
  } catch (err) {
    return NextResponse.json({ success: false, message: err?.message || 'Unauthorized' }, { status: 401 });
  }

  const wallet = await userWalletService.getOrCreateWallet(userId);
  const transactions = await userWalletService.listTransactions(userId, { limit: 50 });
  const recharges = await WalletRecharge.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return NextResponse.json({
    success: true,
    wallet: {
      balance: wallet.balance,
      currency: wallet.currency || 'INR',
      totalCredits: wallet.totalCredits || 0,
      totalDebits: wallet.totalDebits || 0,
      isActive: wallet.isActive !== false,
      transactions,
      recharges,
    },
  });
}
