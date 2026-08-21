import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ResellerApi = require('../src/services/resellerApi.js');
const { getCompanyResellerApiConfig } = require('../src/lib/companyResellerApi.js');

const orderId = '6a6799dd3883dc7c6c76b43b';
const newIp = '103.148.205.60';
const newVmId = '8460';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const uri = raw.match(/MONGOOSE_URL=(.+)/)[1].trim();
await mongoose.connect(uri);

const ordersCol = mongoose.connection.db.collection('orders');
const stocksCol = mongoose.connection.db.collection('ipstocks');
const companiesCol = mongoose.connection.db.collection('companies');

const order = await ordersCol.findOne({ _id: new mongoose.Types.ObjectId(orderId) });
const stock = await stocksCol.findOne({ _id: new mongoose.Types.ObjectId(order.ipStockId) });
const company = await companiesCol.findOne({ _id: stock.company });
const api = new ResellerApi(getCompanyResellerApiConfig(company));

const details = await api.getVmDetails(newVmId);
const password = ResellerApi.extractVmPassword(details);
const username = ResellerApi.extractVmUsername(details) || order.username;
const os = ResellerApi.extractVmOs(details) || order.os;

const newProductName = String(order.productName || '').replace(/162\.4\.147/g, '103.148.205');

await ordersCol.updateOne(
  { _id: order._id },
  {
    $set: {
      ipAddress: newIp,
      resellerVmId: newVmId,
      productName: newProductName,
      username,
      password: password || order.password,
      os,
      provider: 'reseller-api',
      lastSyncTime: new Date(),
    },
  },
);

const updated = await ordersCol.findOne({ _id: order._id });
console.log(JSON.stringify(updated, null, 2));
await mongoose.disconnect();
