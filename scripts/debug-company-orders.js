require('dotenv').config();
const mongoose = require('mongoose');

const SLUG = process.argv[2] || 'rockybhai';

async function main() {
  const url = process.env.MONGOOSE_URL;
  if (!url) {
    console.error('MONGOOSE_URL not set');
    process.exit(1);
  }

  await mongoose.connect(url);
  const db = mongoose.connection.db;

  const company = await db.collection('companies').findOne({ slug: SLUG });
  if (!company) {
    console.error('Company not found:', SLUG);
    process.exit(1);
  }

  console.log('Company:', company.name, company._id.toString());

  const stocks = await db.collection('ipstocks').find({ company: company._id }).toArray();
  const stockIds = stocks.map((s) => String(s._id));
  console.log('Stocks:', stocks.length, stocks.map((s) => s.name).join(', '));

  const allOrders = await db
    .collection('orders')
    .find({ ipStockId: { $in: stockIds } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  console.log('\n=== Latest orders for company stocks ===');
  for (const o of allOrders) {
    console.log(JSON.stringify({
      _id: String(o._id),
      productName: o.productName,
      status: o.status,
      provisioningStatus: o.provisioningStatus,
      transactionId: o.transactionId || '',
      clientTxnId: o.clientTxnId,
      walletDeducted: !!o.walletDeduction?.deducted,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      customerEmail: o.customerEmail,
    }));
  }

  const paidStatuses = ['confirmed', 'paid', 'active', 'completed'];
  const wouldShow = allOrders.filter((o) => paidStatuses.includes(String(o.status || '').toLowerCase()));
  console.log('\n=== Would show in company portal (status whitelist) ===', wouldShow.length);
  for (const o of wouldShow) {
    console.log(`  ${o.status} | ${o.productName} | txn=${o.transactionId || 'NONE'} | wallet=${!!o.walletDeduction?.deducted}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
