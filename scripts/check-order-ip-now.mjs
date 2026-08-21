import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ResellerApi = require('../src/services/resellerApi.js');
const { getCompanyResellerApiConfig } = require('../src/lib/companyResellerApi.js');

const payId = 'pay_TIcCV7p1rpSs3a';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');
const stocksCol = mongoose.connection.db.collection('ipstocks');
const companiesCol = mongoose.connection.db.collection('companies');

const order = await ordersCol.findOne({ transactionId: payId });
console.log('ORDER NOW:', JSON.stringify({
  _id: String(order._id),
  ipAddress: order.ipAddress,
  resellerVmId: order.resellerVmId,
  username: order.username,
  updatedAt: order.updatedAt,
  lastSyncTime: order.lastSyncTime,
}, null, 2));

const stock = await stocksCol.findOne({ _id: new mongoose.Types.ObjectId(order.ipStockId) });
const company = await companiesCol.findOne({ _id: stock.company });
const cfg = getCompanyResellerApiConfig(company);
const api = new ResellerApi(cfg);

if (order.resellerVmId) {
  const row = await api.findVmByIp('103.148.205.60');
  const old = await api.findVmByIp('162.4.147.4');
  console.log('panel new ip vm', row?.vmId, row?.ip);
  console.log('panel old ip vm', old?.vmId, old?.ip);
  const byVm = await api.getVmDetails(order.resellerVmId).catch((e) => ({ error: e.message }));
  console.log('stored vmId details', byVm?.ipAddress || byVm?.ip || byVm?.error);
}

await mongoose.disconnect();
