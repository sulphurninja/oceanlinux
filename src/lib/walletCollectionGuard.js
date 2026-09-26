/**
 * MongoDB-side guard on `wallets`:
 * rejects any write where stored `balance` does not match the ledger
 * (sum of credit/bonus/refund − debit in `transactions[]`).
 *
 * This blocks Compass / raw `updateOne({ $set: { balance: N } })` style
 * fraud. The app connection can still write, but only ledger-consistent docs.
 */

const VALIDATOR = {
  $expr: {
    $and: [
      { $gte: [{ $ifNull: ['$balance', 0] }, 0] },
      {
        $lte: [
          {
            $abs: {
              $subtract: [
                { $ifNull: ['$balance', 0] },
                {
                  $reduce: {
                    input: { $ifNull: ['$transactions', []] },
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        {
                          $switch: {
                            branches: [
                              {
                                case: { $eq: ['$$this.type', 'debit'] },
                                then: { $multiply: [{ $ifNull: ['$$this.amount', 0] }, -1] },
                              },
                              {
                                case: { $in: ['$$this.type', ['credit', 'bonus', 'refund']] },
                                then: { $ifNull: ['$$this.amount', 0] },
                              },
                            ],
                            default: 0,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
          1,
        ],
      },
    ],
  },
};

async function ensureWalletCollectionGuard(mongooseConnection) {
  const db = mongooseConnection?.connection?.db || mongooseConnection?.db;
  if (!db) return { ok: false, reason: 'no_db' };

  try {
    await db.command({
      collMod: 'wallets',
      validator: VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    console.log('[WALLET-GUARD] wallets collection validator active (balance must match ledger)');
    return { ok: true };
  } catch (err) {
    // Namespace not found → create empty collection with validator
    if (err?.code === 26 || /ns does not exist/i.test(err.message || '')) {
      await db.createCollection('wallets', {
        validator: VALIDATOR,
        validationLevel: 'strict',
        validationAction: 'error',
      });
      console.log('[WALLET-GUARD] wallets collection created with validator');
      return { ok: true, created: true };
    }
    console.error('[WALLET-GUARD] failed to enable validator:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  ensureWalletCollectionGuard,
  WALLET_LEDGER_VALIDATOR: VALIDATOR,
};
