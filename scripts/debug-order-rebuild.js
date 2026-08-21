require('dotenv').config();
const mongoose = require('mongoose');
const { VirtualizorAPI } = require('../src/services/virtualizorApi.js');

const ORDER_ID = process.argv[2] || '6a1dce95510d8ef2bca712c6';

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const db = mongoose.connection.db;
  const orders = db.collection('orders');

  let order = null;
  if (mongoose.Types.ObjectId.isValid(ORDER_ID) && String(ORDER_ID).length === 24) {
    order = await orders.findOne({ _id: new mongoose.Types.ObjectId(ORDER_ID) });
  }
  if (!order) order = await orders.findOne({ _id: ORDER_ID });
  if (!order) {
    console.error('Order not found:', ORDER_ID);
    process.exit(1);
  }

  console.log('=== ORDER ===');
  console.log(JSON.stringify({
    _id: String(order._id),
    productName: order.productName,
    provider: order.provider,
    ipAddress: order.ipAddress,
    username: order.username,
    os: order.os,
    hostycareServiceId: order.hostycareServiceId,
    ipStockId: order.ipStockId,
    autoProvisioned: order.autoProvisioned,
    netbayServiceId: order.netbayServiceId,
    status: order.status,
    lastAction: order.lastAction,
    hostname: order.serverDetails?.rawDetails?.hostname,
    ips: order.serverDetails?.rawDetails?.ips,
  }, null, 2));

  let stock = null;
  if (order.ipStockId) {
    try {
      stock = await db.collection('ipstocks').findOne({
        _id: mongoose.Types.ObjectId.isValid(order.ipStockId)
          ? new mongoose.Types.ObjectId(order.ipStockId)
          : order.ipStockId,
      });
    } catch {
      stock = await db.collection('ipstocks').findOne({ _id: order.ipStockId });
    }
    if (stock) {
      console.log('\n=== IP STOCK ===');
      console.log(JSON.stringify({ name: stock.name, company: stock.company ? String(stock.company) : null }, null, 2));
    }
  }

  const ip = (order.ipAddress || '').split(':')[0] || order.serverDetails?.rawDetails?.ips?.[0]?.split(':')[0];
  const hostname = order.serverDetails?.rawDetails?.hostname || order.hostname;

  console.log('\n=== VIRTUALIZOR FIND ===');
  console.log('Searching IP:', ip, 'hostname:', hostname);

  const api = new VirtualizorAPI();
  const start = Date.now();
  const found = await api.findVpsId({ ip, hostname });
  console.log('findVpsId:', found, `(${Date.now() - start}ms)`);

  if (found?.vpsid) {
    const tplStart = Date.now();
    try {
      const tpl = await api.getTemplates(found.vpsid);
      const oslist = tpl?.oslist || tpl?.os || {};
      const keys = oslist && typeof oslist === 'object' ? Object.keys(oslist) : [];
      console.log('getTemplates OK', `(${Date.now() - tplStart}ms)`, 'virt keys:', keys);
    } catch (e) {
      console.error('getTemplates FAILED:', e.message);
    }
  } else if (ip) {
    // Manual scan Mumbai panel only (VIRTUALIZOR_HOST_3)
    console.log('\n=== MANUAL SCAN MUMBAI (account index 2) ===');
    const mumbaiOnly = new VirtualizorAPI({
      accounts: [{
        host: process.env.VIRTUALIZOR_HOST_3,
        port: Number(process.env.VIRTUALIZOR_PORT_3 || 4083),
        key: process.env.VIRTUALIZOR_API_KEY_3,
        pass: process.env.VIRTUALIZOR_API_PASSWORD_3,
        protocol: 'https',
      }],
    });
    const mFound = await mumbaiOnly.findVpsId({ ip, hostname });
    console.log('Mumbai-only findVpsId:', mFound);

    if (!mFound) {
      const vms = await mumbaiOnly._listMyVms(0, { timeoutMs: 25000, retries: 0 });
      const matches = vms.filter(v => v.ips.some(i => i.includes(ip.split('.').slice(0,3).join('.')))).slice(0, 5);
      console.log('Partial subnet matches on Mumbai:', matches.map(v => ({ vpsid: v.vpsid, ips: v.ips, hostname: v.hostname })));
      const exact = vms.filter(v => v.ips.includes(ip));
      console.log('Exact IP matches on Mumbai:', exact);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
