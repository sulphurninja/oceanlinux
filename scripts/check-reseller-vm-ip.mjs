import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ResellerApi = require('../src/services/resellerApi.js');
const { getCompanyResellerApiConfig } = require('../src/lib/companyResellerApi.js');

const orderId = '6a6799dd3883dc7c6c76b43b';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');
const stocksCol = mongoose.connection.db.collection('ipstocks');
const companiesCol = mongoose.connection.db.collection('companies');

const order = await ordersCol.findOne({ _id: new mongoose.Types.ObjectId(orderId) });
const stock = await stocksCol.findOne({ _id: new mongoose.Types.ObjectId(order.ipStockId) });
const company = await companiesCol.findOne({ _id: stock.company });

const cfg = getCompanyResellerApiConfig(company);
console.log('vmId', order.resellerVmId, 'stored ip', order.ipAddress);

if (cfg && order.resellerVmId) {
  const api = new ResellerApi(cfg);
  const details = await api.getVmDetails(order.resellerVmId);
  const overview = await api.findVmByIp('103.148.205.60').catch(() => null);
  console.log('panel details ip', details?.ipAddress || details?.ip);
  console.log('find by new ip', overview);
  const old = await api.findVmByIp('162.4.147.4').catch(() => null);
  console.log('find by old ip', old);
}

await mongoose.disconnect();
