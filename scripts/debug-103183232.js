require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;

  const orders = await db
    .collection('orders')
    .find({
      $or: [{ ipAddress: /103\.183\.232/i }, { productName: /103\.183\.232/i }],
    })
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();

  console.log('=== ORDERS ===');
  for (const o of orders) {
    console.log(
      JSON.stringify(
        {
          clientTxnId: o.clientTxnId,
          orderId: String(o._id),
          product: o.productName,
          ip: o.ipAddress,
          status: o.status,
          provisioningStatus: o.provisioningStatus,
          inventoryItemId: o.inventoryItemId,
          autoProvisioned: o.autoProvisioned,
          provider: o.provider,
          provisioningError: o.provisioningError,
          createdAt: o.createdAt,
          ipStockId: String(o.ipStockId || ''),
        },
        null,
        2
      )
    );
    console.log('---');
  }

  const stocks = await db
    .collection('ipstocks')
    .find({ name: /103\.183\.232/i })
    .toArray();

  console.log('=== STOCKS ===');
  for (const s of stocks) {
    const items = (s.inventoryItems || []).map((i) => ({
      ip: i.ipAddress,
      allocated: i.allocated,
      orderId: i.orderId ? String(i.orderId) : null,
      allocatedAt: i.allocatedAt,
    }));
    console.log(
      JSON.stringify(
        {
          id: String(s._id),
          name: s.name,
          company: String(s.company || ''),
          stockCount: s.stockCount,
          available: s.available,
          availabilityManual: s.availabilityManual,
          inventoryCount: (s.inventoryItems || []).length,
          unallocated: (s.inventoryItems || []).filter((i) => !i.allocated).length,
          items,
          tags: s.tags,
          fulfillmentMode: s.defaultConfigurations?.company?.fulfillmentMode,
          resellerApi: s.defaultConfigurations?.resellerApi
            ? {
                variantStock: s.defaultConfigurations.resellerApi.variantStock,
              }
            : null,
        },
        null,
        2
      )
    );
    console.log('---');
  }

  const badOrderId = process.argv[2];
  if (badOrderId) {
    const oid = new mongoose.Types.ObjectId(badOrderId);
    const order = await db.collection('orders').findOne({ _id: oid });
    const logs = await db
      .collection('paymentorderlogs')
      .find({
        $or: [{ orderId: String(oid) }, { clientTxnId: order?.clientTxnId }],
      })
      .sort({ createdAt: 1 })
      .toArray();
    console.log('=== BAD ORDER DETAIL ===');
    console.log(
      JSON.stringify(
        {
          clientTxnId: order?.clientTxnId,
          createdAt: order?.createdAt,
          lastProvisionAttempt: order?.lastProvisionAttempt,
          ip: order?.ipAddress,
          inventoryItemId: order?.inventoryItemId,
          provider: order?.provider,
          resellerApiOrderId: order?.resellerApiOrderId,
          resellerApiServiceId: order?.resellerApiServiceId,
          memory: order?.memory,
          paymentMethod: order?.paymentMethod,
          provisioningStatus: order?.provisioningStatus,
        },
        null,
        2
      )
    );
    console.log('=== PAYMENT LOGS ===');
    console.log(
      JSON.stringify(
        logs.map((l) => ({
          event: l.event,
          status: l.status,
          at: l.createdAt,
          msg: l.message || l.errorMessage,
        })),
        null,
        2
      )
    );
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
