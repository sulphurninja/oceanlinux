require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const order = await db.collection('orders').findOne({
    clientTxnId: 'ORDER_1784903292015_FBLODH',
  });
  const stock = await db.collection('ipstocks').findOne({
    _id: new mongoose.Types.ObjectId('69cadeb276d57fddb2d8174b'),
  });
  const company = await db.collection('companies').findOne({
    _id: stock.company,
  });

  const savedVps = (stock.inventoryItems || []).find((i) => !i.allocated);

  console.log(
    JSON.stringify(
      {
        badOrder: {
          clientTxnId: order.clientTxnId,
          orderId: String(order._id),
          customer: order.customerName,
          email: order.customerEmail,
          ipDelivered: order.ipAddress,
          provider: order.provider,
          inventoryUsed: !!order.inventoryItemId,
          createdAt: order.createdAt,
          lastProvisionAttempt: order.lastProvisionAttempt,
          username: order.username,
          password: order.password ? '***set***' : null,
        },
        savedVpsStillInStock: savedVps
          ? {
              ip: savedVps.ipAddress,
              username: savedVps.username,
              os: savedVps.os,
            }
          : null,
        stock: {
          unallocatedCount: (stock.inventoryItems || []).filter((i) => !i.allocated).length,
          stockCount: stock.stockCount,
          tags: stock.tags,
        },
        company: {
          name: company.name,
          slug: company.slug,
          resellerLive: company.resellerApi?.useLiveStockApi,
          resellerEnabled: company.resellerApi?.enabled,
        },
        rootCause:
          'Production code skipped saved inventory for live panel (reseller-api) stocks and bought from zone API instead.',
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
