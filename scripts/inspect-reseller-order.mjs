import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const orders = mongoose.connection.db.collection('orders');
const key = 'RESELLER_1787234377610_4JA6DS';

const found = await orders
  .find({
    $or: [
      { clientTxnId: key },
      { transactionId: key },
      { gatewayOrderId: key },
      { resellerOrderId: key },
      { resellerGroupId: key },
      { invoiceNumber: key },
    ],
  })
  .sort({ createdAt: -1 })
  .toArray();

if (!found.length) {
  const rx = new RegExp('1787234377610|4JA6DS');
  const loose = await orders
    .find({
      $or: [
        { clientTxnId: rx },
        { transactionId: rx },
        { gatewayOrderId: rx },
        { resellerOrderId: rx },
        { resellerGroupId: rx },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log('loose hits', loose.length);
  for (const o of loose) {
    console.log(
      JSON.stringify(
        {
          id: String(o._id),
          clientTxnId: o.clientTxnId,
          resellerOrderId: o.resellerOrderId,
          resellerGroupId: o.resellerGroupId,
          productName: o.productName,
          memory: o.memory,
          status: o.status,
          provisioningStatus: o.provisioningStatus,
          provisioningError: o.provisioningError,
          provider: o.provider,
          ipAddress: o.ipAddress,
          createdAt: o.createdAt,
        },
        null,
        2,
      ),
    );
  }
} else {
  for (const o of found) {
    console.log(
      JSON.stringify(
        {
          id: String(o._id),
          user: o.user,
          customerEmail: o.customerEmail,
          customerName: o.customerName,
          productName: o.productName,
          memory: o.memory,
          price: o.price,
          status: o.status,
          provisioningStatus: o.provisioningStatus,
          provisioningError: o.provisioningError,
          provider: o.provider,
          ipAddress: o.ipAddress,
          username: o.username,
          ipStockId: o.ipStockId,
          slotIpPackageId: o.slotIpPackageId,
          autoProvisioned: o.autoProvisioned,
          lastProvisionAttempt: o.lastProvisionAttempt,
          resellerOrderId: o.resellerOrderId,
          resellerGroupId: o.resellerGroupId,
          resellerVmId: o.resellerVmId,
          clientTxnId: o.clientTxnId,
          transactionId: o.transactionId,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt,
          expiryDate: o.expiryDate,
        },
        null,
        2,
      ),
    );
  }
}

await mongoose.disconnect();
