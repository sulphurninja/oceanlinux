import mongoose from 'mongoose';
import Wallet from '@/models/walletModel';

/**
 * Canonical customer Wallet mutator.
 *
 * Hardening (fraud):
 *   - credit/debit are single-document atomic ($inc + $push together)
 *   - debit refuses when stored balance > ledger-reconstructed balance
 *     (blocks Mongo-inflated wallets with no credit txns)
 *   - debit also refuses when credits are not trusted
 *     (gateway recharge / admin_panel / refund) — blocks planted fake credits
 *   - inactive wallets cannot debit
 */

const TRANSACTION_TYPES = new Set(['credit', 'debit', 'refund', 'bonus']);

/** Admin panel single credit/bonus cap (₹). */
export const MAX_ADMIN_WALLET_CREDIT = 50000;

/** Tolerate ₹1 of float drift. */
const BALANCE_TOLERANCE = 1;

function normalizeAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Wallet amount must be a positive number');
  }
  return Math.round(n * 100) / 100;
}

function sortTxns(txns = []) {
  return txns.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return String(a._id || '').localeCompare(String(b._id || ''));
  });
}

/** Reconstruct balance from ledger alone (start at ₹0). */
export function ledgerBalanceFromTransactions(transactions = []) {
  let bal = 0;
  for (const t of sortTxns(transactions)) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'debit') bal -= amt;
    else if (t.type === 'credit' || t.type === 'bonus' || t.type === 'refund') bal += amt;
  }
  return Math.round(bal * 100) / 100;
}

/**
 * Stored balance must not exceed what credits/debits explain.
 * Catches direct Mongo $set/$inc of balance without credit rows.
 */
export function getWalletIntegrity(wallet) {
  if (!wallet) {
    return { ok: false, reason: 'wallet_missing', stored: 0, ledger: 0, unexplained: 0 };
  }
  const stored = Math.round((Number(wallet.balance) || 0) * 100) / 100;
  const ledger = ledgerBalanceFromTransactions(wallet.transactions || []);
  const unexplained = Math.round((stored - ledger) * 100) / 100;
  if (unexplained > BALANCE_TOLERANCE) {
    return {
      ok: false,
      reason: 'balance_exceeds_ledger',
      stored,
      ledger,
      unexplained,
    };
  }
  return { ok: true, reason: 'ok', stored, ledger, unexplained: Math.max(0, unexplained) };
}

async function freezeWallet(userId, reason, details = {}) {
  try {
    await Wallet.updateOne(
      { userId },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
        },
      }
    );
  } catch (err) {
    console.error('[WALLET] freeze failed', userId, err.message);
  }
  console.error('[WALLET-INTEGRITY] frozen', {
    userId: String(userId),
    reason,
    ...details,
  });
}

async function getOrCreateWallet(userId) {
  if (!userId) throw new Error('userId is required');
  let wallet = await Wallet.findOne({ userId });
  if (wallet) return wallet;
  try {
    wallet = await Wallet.create({ userId, balance: 0, transactions: [], isActive: true });
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
 * Atomically debit + append ledger row in ONE update.
 */
async function debit(userId, amount, opts = {}) {
  const value = normalizeAmount(amount);
  await getOrCreateWallet(userId);

  const txnId = new mongoose.Types.ObjectId();
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await Wallet.findOne({ userId }).lean();
    if (!current) throw new Error('Wallet not found');
    if (current.isActive === false) {
      throw new Error('Wallet is locked. Contact support.');
    }

    const integrity = getWalletIntegrity(current);
    if (!integrity.ok) {
      await freezeWallet(userId, integrity.reason, integrity);
      throw new Error(
        'Wallet locked: balance does not match payment history. Recharge/payment ledger mismatch.'
      );
    }

    // Reject spend when balance is explained only by untrusted Mongo-planted credits
    // (credits without admin_panel / confirmed WalletRecharge / refund proof).
    const { assertWalletTrustedForSpend } = require('@/lib/orderPaymentStatus');
    const funding = await assertWalletTrustedForSpend(userId);
    if (!funding.ok) {
      await freezeWallet(userId, funding.reason, funding);
      throw new Error(
        'Wallet locked: balance is not backed by verified payments (gateway recharge / admin credit).'
      );
    }

    const balanceBefore = Math.round((Number(current.balance) || 0) * 100) / 100;
    if (balanceBefore < value) {
      throw new Error('Insufficient wallet balance');
    }
    const balanceAfter = Math.round((balanceBefore - value) * 100) / 100;

    const txn = {
      _id: txnId,
      type: 'debit',
      amount: value,
      description: opts.description || 'Wallet debit',
      reference: opts.reference || '',
      balanceBefore,
      balanceAfter,
      metadata: opts.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    const updated = await Wallet.findOneAndUpdate(
      {
        userId,
        isActive: { $ne: false },
        balance: balanceBefore,
      },
      {
        $inc: { balance: -value, totalDebits: value },
        $push: { transactions: txn },
      },
      { new: true }
    );

    if (updated) {
      return {
        walletTxnId: txnId.toString(),
        balanceBefore,
        balanceAfter: updated.balance,
        transaction: txn,
      };
    }
  }

  throw new Error('Wallet debit failed due to concurrent update. Please retry.');
}

/**
 * Atomically credit + append ledger row in ONE update.
 * Attaches HMAC metadata.proof so Compass-planted credits cannot be spent.
 */
async function credit(userId, amount, opts = {}) {
  const value = normalizeAmount(amount);
  const type = opts.type && TRANSACTION_TYPES.has(opts.type) ? opts.type : 'credit';

  await getOrCreateWallet(userId);

  const txnId = new mongoose.Types.ObjectId();
  const now = new Date();
  const { signWalletCreditProof } = require('@/lib/walletCreditProof');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await Wallet.findOne({ userId }).lean();
    if (!current) throw new Error('Wallet not found for credit');

    const balanceBefore = Math.round((Number(current.balance) || 0) * 100) / 100;
    const balanceAfter = Math.round((balanceBefore + value) * 100) / 100;

    const metadata = { ...(opts.metadata || {}) };
    if (!metadata.source) {
      if (type === 'refund') metadata.source = 'refund';
      else if (metadata.rechargeId) metadata.source = 'wallet_recharge';
    }
    const proof = signWalletCreditProof({
      userId,
      amount: value,
      txnId,
      type,
      source: metadata.source || '',
      reference: opts.reference || '',
    });
    if (proof) metadata.proof = proof;

    const txn = {
      _id: txnId,
      type,
      amount: value,
      description: opts.description || 'Wallet credit',
      reference: opts.reference || '',
      balanceBefore,
      balanceAfter,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    const inc = { balance: value };
    if (type !== 'debit') inc.totalCredits = value;

    const updated = await Wallet.findOneAndUpdate(
      { userId, balance: balanceBefore },
      {
        $inc: inc,
        $push: { transactions: txn },
      },
      { new: true }
    );

    if (updated) {
      return {
        walletTxnId: txnId.toString(),
        balanceBefore,
        balanceAfter: updated.balance,
        transaction: txn,
      };
    }
  }

  throw new Error('Wallet credit failed due to concurrent update. Please retry.');
}

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

async function findTxnByReference(userId, reference, types = ['credit', 'refund', 'bonus']) {
  if (!userId || !reference) return null;
  const ref = String(reference);
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet?.transactions?.length) return null;
  return (
    wallet.transactions.find(
      (t) => String(t.reference || '') === ref && types.includes(t.type)
    ) || null
  );
}

/** Read-only integrity report for admin tools. */
async function inspectIntegrity(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  const base = getWalletIntegrity(wallet);
  if (!wallet) return base;
  try {
    const { trustedLedgerBalance } = require('@/lib/orderPaymentStatus');
    const trusted = await trustedLedgerBalance(wallet);
    const stored = Math.round((Number(wallet.balance) || 0) * 100) / 100;
    const untrustedGap = Math.round((stored - trusted) * 100) / 100;
    return {
      ...base,
      trusted,
      untrustedGap,
      trustedOk: untrustedGap <= BALANCE_TOLERANCE,
    };
  } catch (err) {
    return { ...base, trustedError: err.message };
  }
}

const userWalletService = {
  getOrCreateWallet,
  getBalance,
  hasSufficient,
  credit,
  debit,
  refund,
  listTransactions,
  findTxnByReference,
  inspectIntegrity,
  getWalletIntegrity,
  ledgerBalanceFromTransactions,
  MAX_ADMIN_WALLET_CREDIT,
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
  findTxnByReference,
  inspectIntegrity,
};
