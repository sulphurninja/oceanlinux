import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { authenticateReseller } from '@/lib/resellerAuth';
import { fetchEnrichedWalletTransactions } from '@/lib/resellerWalletTransactions';

export async function GET(request) {
  await connectDB();

  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { reseller } = auth;
  const transactions = await fetchEnrichedWalletTransactions(reseller);

  return NextResponse.json({
    success: true,
    balance: reseller.wallet?.balance ?? 0,
    currency: reseller.wallet?.currency ?? 'INR',
    creditLimit: reseller.wallet?.creditLimit ?? 0,
    minBalance: reseller.wallet?.minBalance ?? 0,
    overview: {
      totalRecharged: reseller.stats?.totalRecharge ?? 0,
      totalSpent: reseller.stats?.totalSpent ?? 0,
      totalOrders: reseller.stats?.totalOrders ?? 0,
    },
    transactions,
  });
}
