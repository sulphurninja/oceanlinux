import 'dotenv/config';
import mongoose from 'mongoose';

const orderId = process.argv[2] || '6a6723a8d3e6d0c5a1987604';
const fresh = process.argv.includes('--fresh');

await mongoose.connect(process.env.MONGOOSE_URL);

// Ensure KuroHost API is enabled for the stock's company
const order = await mongoose.connection.db.collection('orders').findOne({
  _id: new mongoose.Types.ObjectId(orderId),
});
const stock = order?.ipStockId
  ? await mongoose.connection.db.collection('ipstocks').findOne({
      _id: new mongoose.Types.ObjectId(order.ipStockId),
    })
  : null;
if (stock?.company) {
  await mongoose.connection.db.collection('companies').updateOne(
    { _id: stock.company },
    { $set: { 'kurohostApi.enabled': true } }
  );
}

const resetFields = fresh
  ? {
      $set: { provisioningStatus: 'pending', provisioningError: '' },
      $unset: { kurohostInstanceId: '', kurohostJobId: '' },
    }
  : {
      $set: {
        provisioningStatus: 'pending',
        provisioningError: '',
      },
    };

await mongoose.connection.db.collection('orders').updateOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  resetFields
);

const { default: AutoProvisioningService } = await import('../src/services/autoProvisioningService.js');
const svc = new AutoProvisioningService();
const result = await svc.provisionServer(orderId);
console.log('result', JSON.stringify(result, null, 2));

const updated = await mongoose.connection.db.collection('orders').findOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  {
    projection: {
      status: 1,
      provisioningStatus: 1,
      provisioningError: 1,
      ipAddress: 1,
      password: 1,
      kurohostInstanceId: 1,
      username: 1,
      panelUsername: 1,
    },
  }
);
console.log('updated', JSON.stringify(updated, null, 2));
await mongoose.disconnect();
