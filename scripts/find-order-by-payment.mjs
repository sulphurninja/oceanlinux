import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const payId = 'pay_TIcCV7p1rpSs3a';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');

const queries = [
  { paymentId: payId },
  { razorpayPaymentId: payId },
  { razorpayOrderId: payId },
  { transactionId: payId },
  { ipAddress: /162\.4\.147\.4/ },
  { ipAddress: /103\.148\.205\.60/ },
];

for (const q of queries) {
  const found = await ordersCol.find(q).limit(3).toArray();
  if (found.length) {
    console.log('query', JSON.stringify(q), 'hits', found.length);
    for (const o of found) {
      console.log(
        JSON.stringify(
          {
            _id: String(o._id),
            paymentId: o.paymentId,
            razorpayPaymentId: o.razorpayPaymentId,
            ipAddress: o.ipAddress,
            displayIpAddress: o.displayIpAddress,
            username: o.username,
            provider: o.provider,
            netbayServiceId: o.netbayServiceId,
            inventoryItemId: o.inventoryItemId,
            ipStockId: o.ipStockId,
            slotIpPackageId: o.slotIpPackageId,
            slotIpId: o.slotIpId,
            customerEmail: o.customerEmail,
            status: o.status,
          },
          null,
          2,
        ),
      );
    }
  }
}

await mongoose.disconnect();
