import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/userModel';
import Wallet from '@/models/walletModel';
import WalletRecharge from '@/models/walletRechargeModel';
import { requireAdmin } from '@/lib/adminAuth';

function isAdminPanelCredit(txn) {
  if (!txn || !['credit', 'bonus', 'refund'].includes(txn.type)) return false;
  if (txn.metadata?.source === 'admin_panel') return true;
  const ref = String(txn.reference || '');
  return ref.startsWith('admin_credit');
}

/**
 * GET /api/admin/wallet-recharges
 * Lists customer wallet top-ups (WalletRecharge) and admin manual credits.
 */
export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const [recharges, wallets] = await Promise.all([
      WalletRecharge.find(query)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Wallet.find({
        transactions: {
          $elemMatch: {
            type: { $in: ['credit', 'bonus', 'refund'] },
          },
        },
      })
        .select('userId transactions')
        .lean(),
    ]);

    const rechargeWalletTxnIds = new Set(
      recharges
        .map((r) => r.walletTxnId)
        .filter(Boolean)
        .map(String),
    );

    const adminCreditUserIds = new Set();
    const adminCredits = [];

    for (const wallet of wallets) {
      for (const txn of wallet.transactions || []) {
        if (!isAdminPanelCredit(txn)) continue;

        const walletTxnId = String(txn._id);
        if (rechargeWalletTxnIds.has(walletTxnId)) continue;

        adminCreditUserIds.add(String(wallet.userId));
        adminCredits.push({
          _id: `admin_${wallet.userId}_${walletTxnId}`,
          entryType: 'admin_credit',
          user: String(wallet.userId),
          amount: txn.amount,
          currency: 'INR',
          clientTxnId: txn.reference || '—',
          paymentMethod: 'admin',
          gatewayOrderId: '',
          transactionId: '',
          walletTxnId,
          status: 'confirmed',
          description: txn.description,
          performedByEmail: txn.metadata?.performedByEmail || '',
          creditedAt: txn.createdAt,
          createdAt: txn.createdAt,
        });
      }
    }

    const users = await User.find({ _id: { $in: [...adminCreditUserIds] } })
      .select('name email phone')
      .lean();
    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

    const normalizedRecharges = recharges.map((r) => ({
      ...r,
      entryType: 'recharge',
    }));

    const normalizedAdminCredits = adminCredits.map((c) => ({
      ...c,
      user: userMap[c.user] || { _id: c.user },
    }));

    const items = [...normalizedRecharges, ...normalizedAdminCredits]
      .sort(
        (a, b) =>
          new Date(b.creditedAt || b.createdAt).getTime() -
          new Date(a.creditedAt || a.createdAt).getTime(),
      )
      .slice(0, limit);

    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[ADMIN/WALLET-RECHARGES] Error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch wallet recharges', error: error.message },
      { status: 500 },
    );
  }
}
