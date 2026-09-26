/**
 * Mongo validators that raise the bar for Compass / raw driver fraud.
 * App-layer HMAC + live Razorpay remain the real gates; these reject
 * obviously incomplete confirmed recharges.
 */

const WALLET_RECHARGE_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['user', 'amount', 'clientTxnId', 'status'],
    properties: {
      amount: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 1 },
      status: {
        enum: ['pending', 'processing', 'confirmed', 'failed', 'refunded'],
      },
    },
    // confirmed ⇒ must have walletTxnId + (gatewayOrderId or transactionId)
    allOf: [
      {
        if: {
          properties: { status: { enum: ['confirmed'] } },
        },
        then: {
          allOf: [
            {
              properties: {
                walletTxnId: { bsonType: 'string', minLength: 1 },
              },
              required: ['walletTxnId'],
            },
            {
              anyOf: [
                {
                  properties: {
                    gatewayOrderId: { bsonType: 'string', minLength: 6 },
                  },
                  required: ['gatewayOrderId'],
                },
                {
                  properties: {
                    transactionId: { bsonType: 'string', minLength: 6 },
                  },
                  required: ['transactionId'],
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

async function ensureWalletRechargeCollectionGuard(mongooseConnection) {
  const db = mongooseConnection?.connection?.db || mongooseConnection?.db;
  if (!db) return { ok: false, reason: 'no_db' };

  try {
    await db.command({
      collMod: 'walletrecharges',
      validator: WALLET_RECHARGE_VALIDATOR,
      validationLevel: 'moderate', // existing docs OK; new/updated confirmed must comply
      validationAction: 'error',
    });
    console.log('[RECHARGE-GUARD] walletrecharges validator active (confirmed needs gateway + walletTxnId)');
    return { ok: true };
  } catch (err) {
    if (err?.code === 26 || /ns does not exist/i.test(err.message || '')) {
      await db.createCollection('walletrecharges', {
        validator: WALLET_RECHARGE_VALIDATOR,
        validationLevel: 'moderate',
        validationAction: 'error',
      });
      console.log('[RECHARGE-GUARD] walletrecharges collection created with validator');
      return { ok: true, created: true };
    }
    console.error('[RECHARGE-GUARD] failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * One-time (per process) backfill: attach HMAC proof to existing unsigned
 * admin_panel / wallet_recharge / refund credits so legitimate balances stay spendable.
 */
async function backfillWalletCreditProofs(mongooseConnection) {
  const db = mongooseConnection?.connection?.db || mongooseConnection?.db;
  if (!db) return { ok: false, reason: 'no_db' };

  const { signWalletCreditProof, getHmacSecret } = require('@/lib/walletCreditProof');
  if (!getHmacSecret()) {
    console.warn('[WALLET-PROOF] no HMAC secret — skip backfill');
    return { ok: false, reason: 'no_secret' };
  }

  const col = db.collection('wallets');
  const wallets = await col
    .find({
      transactions: {
        $elemMatch: {
          type: { $in: ['credit', 'bonus', 'refund'] },
          $or: [
            { 'metadata.proof': { $exists: false } },
            { 'metadata.proof': null },
            { 'metadata.proof': '' },
          ],
        },
      },
    })
    .project({ userId: 1, transactions: 1 })
    .toArray();

  let signed = 0;
  let walletsUpdated = 0;

  for (const w of wallets) {
    let changed = false;
    const txns = (w.transactions || []).map((t) => {
      if (!['credit', 'bonus', 'refund'].includes(t.type)) return t;
      if (t.metadata?.proof) return t;

      const src =
        t.metadata?.source ||
        (t.type === 'refund' ? 'refund' : t.metadata?.rechargeId ? 'wallet_recharge' : '');

      // Only auto-sign known app sources — never sign random planted credits
      const allowable =
        src === 'admin_panel' ||
        src === 'wallet_recharge' ||
        src === 'integrity_reconcile' ||
        src === 'refund' ||
        t.type === 'refund' ||
        String(t.reference || '').startsWith('admin_');

      if (!allowable) return t;

      const source =
        src ||
        (String(t.reference || '').startsWith('admin_')
          ? 'admin_panel'
          : t.type === 'refund'
            ? 'refund'
            : 'wallet_recharge');

      const proof = signWalletCreditProof({
        userId: w.userId,
        amount: t.amount,
        txnId: t._id,
        type: t.type,
        source,
        reference: t.reference || '',
      });
      if (!proof) return t;

      changed = true;
      signed += 1;
      return {
        ...t,
        metadata: {
          ...(t.metadata || {}),
          source,
          proof,
          proofBackfilledAt: new Date(),
        },
      };
    });

    if (changed) {
      await col.updateOne({ _id: w._id }, { $set: { transactions: txns } });
      walletsUpdated += 1;
    }
  }

  if (signed > 0) {
    console.log(`[WALLET-PROOF] backfilled HMAC on ${signed} credits across ${walletsUpdated} wallets`);
  }
  return { ok: true, signed, walletsUpdated };
}

module.exports = {
  ensureWalletRechargeCollectionGuard,
  backfillWalletCreditProofs,
  WALLET_RECHARGE_VALIDATOR,
};
