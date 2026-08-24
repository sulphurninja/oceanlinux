const path = require('path');
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const connectDB = require('../src/lib/db').default;
const Order = require('../src/models/orderModel').default;
const IPStock = require('../src/models/ipStockModel');

const payId = process.argv[2];

(async () => {
  await connectDB();
  const or = [
    { transactionId: payId },
    { 'paymentDetails.payment_id': payId },
    { 'renewalPayments.paymentId': payId },
    { gatewayOrderId: payId },
  ];

  const orders = await Order.find({ $or: or }).lean();
  console.log('Orders found:', orders.length);
  for (const o of orders) {
    const stock = o.ipStockId ? await IPStock.findById(o.ipStockId).lean() : null;
    const mo = stock?.memoryOptions;
    const memOpts = mo instanceof Map ? Object.fromEntries(mo) : mo;
    console.log(JSON.stringify({
      orderId: o._id,
      productName: o.productName,
      memory: o.memory,
      price: o.price,
      originalPrice: o.originalPrice,
      promoDiscount: o.promoDiscount,
      promoCode: o.promoCode,
      paymentMethod: o.paymentMethod,
      transactionId: o.transactionId,
      gatewayOrderId: o.gatewayOrderId,
      paymentDetails: o.paymentDetails,
      pricing: o.pricing,
      ipStockId: o.ipStockId,
      stockName: stock?.name,
      stockMemoryPrice: memOpts?.[o.memory]?.price,
      allMemoryPrices: memOpts,
      status: o.status,
      createdAt: o.createdAt,
    }, null, 2));
  }

  const renewals = await Order.find({ 'renewalPayments.paymentId': payId }).lean();
  if (renewals.length) {
    for (const o of renewals) {
      const rp = o.renewalPayments.find((r) => r.paymentId === payId);
      console.log('RENEWAL PAYMENT:', JSON.stringify({ orderId: o._id, productName: o.productName, renewal: rp }, null, 2));
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
