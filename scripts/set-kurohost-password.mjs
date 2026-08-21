import 'dotenv/config';
import mongoose from 'mongoose';
import KurohostApi from '../src/services/kurohostApi.js';
import { generateSecurePassword } from '../src/lib/securePassword.js';

const orderId = process.argv[2] || '6a6723a8d3e6d0c5a1987604';

await mongoose.connect(process.env.MONGOOSE_URL);

const order = await mongoose.connection.db.collection('orders').findOne({
  _id: new mongoose.Types.ObjectId(orderId),
});
if (!order?.kurohostInstanceId) {
  console.error('Order has no KuroHost instance');
  process.exit(1);
}

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

const inst = KurohostApi.unwrapInstance(await api.getInstance(order.kurohostInstanceId));
const osTemplateId = inst?.osTemplateId || order.kurohostOsTemplateId;
if (!osTemplateId) {
  console.error('Could not resolve osTemplateId');
  process.exit(1);
}

const newPassword = generateSecurePassword();
const isWindows = !!inst?.osTemplate?.isWindows;
console.log('Reinstalling with new password for instance', order.kurohostInstanceId);

const apiRes = await api.reinstallInstance(order.kurohostInstanceId, {
  osTemplateId: String(osTemplateId),
  password: newPassword,
});
const jobId = apiRes?.job?.id || apiRes?.jobId || null;
if (jobId) {
  console.log('Waiting for reinstall job', jobId);
  await api.waitForJob(jobId, { maxWaitMs: 600_000, pollIntervalMs: 5_000 });
}

await mongoose.connection.db.collection('orders').updateOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  {
    $set: {
      password: newPassword,
      username: isWindows ? 'Administrator' : 'root',
      provisioningStatus: 'active',
      provisioningError: '',
      status: 'active',
      ipAddress: KurohostApi.extractInstanceIp(inst) || order.ipAddress || '',
      lastSyncTime: new Date(),
    },
  }
);

const updated = await mongoose.connection.db.collection('orders').findOne(
  { _id: new mongoose.Types.ObjectId(orderId) },
  { projection: { ipAddress: 1, username: 1, password: 1, provisioningStatus: 1 } }
);
console.log('Password set. Dashboard should show:', {
  ip: updated.ipAddress,
  username: updated.username,
  password: updated.password,
});
await mongoose.disconnect();
