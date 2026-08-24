import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { authenticateReseller } from '@/lib/resellerAuth';
import { fetchEnrichedWalletTransactions } from '@/lib/resellerWalletTransactions';

/** GET /api/v1/reseller/transactions — wallet ledger only */
export async function GET(request) {
  await connectDB();

  const auth = await authenticateReseller(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const transactions = await fetchEnrichedWalletTransactions(auth.reseller);

  return NextResponse.json({
    success: true,
    currency: auth.reseller.wallet?.currency ?? 'INR',
    balance: auth.reseller.wallet?.balance ?? 0,
    count: transactions.length,
    transactions,
  });
}
