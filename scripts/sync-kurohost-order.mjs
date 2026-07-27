import 'dotenv/config';
import mongoose from 'mongoose';
import KurohostApi from '../src/services/kurohostApi.js';

const orderId = process.argv[2] || '6a6723a8d3e6d0c5a1987604';
const instanceId = process.argv[3] || 'cms30zwjm02izs2q38vlc8omq';

await mongoose.connect(process.env.MONGOOSE_URL);

const order = await mongoose.connection.db.collection('orders').findOne({
  _id: new mongoose.Types.ObjectId(orderId),
});
const stock = await mongoose.connection.db.collection('ipstocks').findOne({
  _id: new mongoose.Types.ObjectId(order.ipStockId),
});
const company = await mongoose.connection.db.collection('companies').findOne({
  _id: stock.company,
});

const api = new KurohostApi({
  baseUrl: company.kurohostApi.baseUrl,
  apiKey: company.kurohostApi.apiKey,
});

const detailRes = await api.getInstance(instanceId);
const inst = KurohostApi.unwrapInstance(detailRes);
const ipAddress = KurohostApi.extractInstanceIp(inst) || '';
const creds = KurohostApi.extractCredentials(inst);
const status = String(inst?.status || '').toUpperCase();
const fullyProvisioned = !!(ipAddress && instanceId);

console.log('instance status', status);
console.log('ip', ipAddress);
console.log('username', creds.username);
console.log('password', creds.password ? '[set]' : '[empty]');

await mongoose.connection.db.collection('orders').updateOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  {
    $set: {
      kurohostInstanceId: instanceId,
      kurohostZoneId: inst?.cloudZoneId || stock?.defaultConfigurations?.kurohost?.cloudZoneId,
      kurohostFlavorId: inst?.flavorId,
      provider: 'kurohost',
      ipAddress,
      username: creds.username || 'root',
      password: creds.password || '',
      status: fullyProvisioned ? 'active' : 'confirmed',
      provisioningStatus: fullyProvisioned ? 'active' : 'provisioning',
      provisioningError: fullyProvisioned
        ? ''
        : `PENDING: instance created, awaiting ${!ipAddress ? 'IP assignment' : 'credentials'}. Will retry automatically.`,
      autoProvisioned: true,
    },
  }
);

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
    },
  }
);
console.log('updated', JSON.stringify(updated, null, 2));
await mongoose.disconnect();
