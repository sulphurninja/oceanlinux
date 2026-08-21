import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const RESELLER_EMAIL = process.argv[2] || 'phoneixvps@gmail.com';
const REFUND_AMOUNT = Number(process.argv[3] || 1095);
const REASON_ID = process.argv[4] || 'custom_price_refund_2026_08_21_phoneix';

const DESCRIPTION =
  'Custom price refund — orders charged at full rate before custom pricing applied (₹249×4 + ₹99×1)';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGOOSE_URL || process.env.MONGO_URI;
  if (!uri) {
    console.error('Database URL not configured');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const Reseller = mongoose.connection.collection('resellers');

  const reseller = await Reseller.findOne({
    email: new RegExp(RESELLER_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  });
  if (!reseller) {
    console.error('Reseller not found:', RESELLER_EMAIL);
    process.exit(1);
  }

  const existing = (reseller.wallet?.transactions || []).find(
    (t) =>
      t.type === 'adjustment' &&
      t.metadata?.reason === REASON_ID &&
      Number(t.amount) === REFUND_AMOUNT,
  );
  if (existing) {
    console.log('Already credited — skipping duplicate');
    console.log('Balance:', reseller.wallet?.balance);
    await mongoose.disconnect();
    return;
  }

  const previousBalance = Number(reseller.wallet?.balance) || 0;
  const newBalance = previousBalance + REFUND_AMOUNT;

  const txn = {
    type: 'adjustment',
    amount: REFUND_AMOUNT,
    previousBalance,
    newBalance,
    description: DESCRIPTION,
    metadata: {
      source: 'admin_script',
      reason: REASON_ID,
      resellerEmail: reseller.email,
      refundBreakdown: {
        orders1299to1050: { count: 4, perOrder: 249, subtotal: 996 },
        orders699to600: { count: 1, perOrder: 99, subtotal: 99 },
        total: REFUND_AMOUNT,
      },
    },
    createdAt: new Date(),
  };

  await Reseller.updateOne(
    { _id: reseller._id },
    {
      $set: { 'wallet.balance': newBalance },
      $push: { 'wallet.transactions': txn },
    },
  );

  console.log('=== CREDIT SUCCESS ===');
  console.log('Reseller:', reseller.businessName, reseller.email);
  console.log('Previous balance: ₹', previousBalance);
  console.log('Credited: ₹', REFUND_AMOUNT);
  console.log('New balance: ₹', newBalance);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
