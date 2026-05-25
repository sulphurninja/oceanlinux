import mongoose from 'mongoose';
import Wallet from '@/models/walletModel';

/**
 * The single canonical place that mutates customer-facing `Wallet`
 * documents. All cart-checkout reservations, wallet recharges, refunds,
 * and the legacy `/api/v1/servers/purchase` API funnel through this
 * service so balance accounting is consistent everywhere.
 *
 * Atomicity:
 *   - `debit` uses a single `findOneAndUpdate` with a `balance >= amount`
 *     guard so two concurrent checkouts can never overspend.
 *   - `credit` and `refund` use `$inc` so they are race-free.
 *   - Each call appends one `transactions[]` subdoc carrying
 *     `balanceBefore` / `balanceAfter` for audit.
 *
 * Note: this service does NOT use multi-doc Mongo transactions because
 * every mutation only touches one wallet document; per-doc atomic
 * operators are sufficient and avoid requiring a replica set.
 */

const TRANSACTION_TYPES = new Set(['credit', 'debit', 'refund', 'bonus']);

function normalizeAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Wallet amount must be a positive number');
  }
  return Math.round(n * 100) / 100;
}

async function getOrCreateWallet(userId) {
  if (!userId) throw new Error('userId is required');
  let wallet = await Wallet.findOne({ userId });
  if (wallet) return wallet;
  try {
    wallet = await Wallet.create({ userId, balance: 0, transactions: [] });
  } catch (err) {
    if (err.code === 11000) {
      wallet = await Wallet.findOne({ userId });
      if (wallet) return wallet;
    }
    throw err;
  }
  return wallet;
}

async function getBalance(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  return wallet?.balance || 0;
}

async function hasSufficient(userId, amount) {
  const balance = await getBalance(userId);
  return balance >= normalizeAmount(amount);
}

/**
 * Atomically debits the wallet and appends one `debit` (or `refund`-shaped
 * negative-direction) transaction. Returns the appended subdoc so the
 * caller can store `walletTxnId` in CheckoutSession / WalletRecharge /
 * Order docs for audit + reconciliation.
 *
 * Throws if balance is insufficient, the wallet is missing, or amount is
 * not positive.
 */
async function debit(userId, amount, opts = {}) {
  const value = normalizeAmount(amount);
  await getOrCreateWallet(userId);

  // Atomic balance-guard: only succeeds if balance >= value.
  const txnId = new mongoose.Types.ObjectId();
  const updated = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: value } },
    {
      $inc: { balance: -value, totalDebits: value },
    },
    { new: true }
  );
  if (!updated) {
    throw new Error('Insufficient wallet balance');
  }
  const balanceAfter = updated.balance;
  const balanceBefore = balanceAfter + value;

  const txn = {
    _id: txnId,
    type: 'debit',
    amount: value,
    description: opts.description || 'Wallet debit',
    reference: opts.reference || '',
    balanceBefore,
    balanceAfter,
    metadata: opts.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await Wallet.updateOne({ userId }, { $push: { transactions: txn } });

  return { walletTxnId: txnId.toString(), balanceBefore, balanceAfter, transaction: txn };
}

/**
 * Atomically credits the wallet (top-up, refund, bonus). `type` defaults
 * to 'credit' but callers should pass 'refund' for sweep refunds and
 * 'bonus' for promo credits to keep the audit trail meaningful.
 */
async function credit(userId, amount, opts = {}) {
  const value = normalizeAmount(amount);
  const type = opts.type && TRANSACTION_TYPES.has(opts.type) ? opts.type : 'credit';

  await getOrCreateWallet(userId);

  const updated = await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: {
        balance: value,
        totalCredits: type === 'debit' ? 0 : value,
      },
    },
    { new: true }
  );
  if (!updated) {
    throw new Error('Wallet not found for credit');
  }
  const balanceAfter = updated.balance;
  const balanceBefore = balanceAfter - value;

  const txnId = new mongoose.Types.ObjectId();
  const txn = {
    _id: txnId,
    type,
    amount: value,
    description: opts.description || 'Wallet credit',
    reference: opts.reference || '',
    balanceBefore,
    balanceAfter,
    metadata: opts.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await Wallet.updateOne({ userId }, { $push: { transactions: txn } });

  return { walletTxnId: txnId.toString(), balanceBefore, balanceAfter, transaction: txn };
}

/**
 * Convenience around `credit(..., { type: 'refund' })` used by the
 * sweep job and the explicit cart cancel route.
 */
async function refund(userId, amount, opts = {}) {
  return credit(userId, amount, {
    ...opts,
    type: 'refund',
    description: opts.description || 'Wallet refund',
  });
}

async function listTransactions(userId, { limit = 50, offset = 0 } = {}) {
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet) return [];
  const all = (wallet.transactions || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return all.slice(offset, offset + limit);
}

const userWalletService = {
  getOrCreateWallet,
  getBalance,
  hasSufficient,
  credit,
  debit,
  refund,
  listTransactions,
};

export default userWalletService;
export {
  getOrCreateWallet,
  getBalance,
  hasSufficient,
  credit,
  debit,
  refund,
  listTransactions,
};
