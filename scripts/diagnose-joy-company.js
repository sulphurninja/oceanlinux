/**
 * Diagnose Joy Services company wiring + sample orders.
 * Run: node scripts/diagnose-joy-company.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const JoyApi = require('../src/services/joyApi');
const { getCompanyJoyApiConfig } = require('../src/lib/companyJoyApi');

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Company = mongoose.connection.collection('companies');
  const IPStock = mongoose.connection.collection('ipstocks');
  const Order = mongoose.connection.collection('orders');

  const joyCos = await Company.find({
    $or: [{ name: /joy/i }, { 'joyApi.enabled': true }],
  }).toArray();

  console.log('=== Joy-related companies:', joyCos.length, '===\n');

  for (const c of joyCos) {
    const cfg = getCompanyJoyApiConfig(c);
    console.log('Company:', c.name, '(' + c._id + ')');
    console.log('  joyApi.enabled:', c.joyApi?.enabled);
    console.log('  resolved config:', cfg ? 'OK' : 'MISSING (token/key/enabled?)');
    console.log('  virtualizor:', !!(c.virtualizor?.host || (c.virtualizors || []).length));
    console.log('  resellerApi:', !!c.resellerApi?.enabled);
    console.log('  netbayApi:', !!c.netbayApi?.enabled);
    console.log('  kurohostApi:', !!c.kurohostApi?.enabled);

    if (cfg) {
      try {
        const api = new JoyApi(cfg);
        const test = await api.test();
        const machines = await api.machineList();
        console.log('  API test: OK —', test.email || test.username || 'connected');
        console.log('  Joy machines in panel:', machines.length);
        if (machines.length) {
          console.log('  Sample IPs:', machines.slice(0, 5).map((m) => m.ip).join(', '));
        }
      } catch (err) {
        console.log('  API test: FAILED —', err.message);
      }
    }

    const stocks = await IPStock.find({ company: c._id }).toArray();
    console.log('  IP stocks linked:', stocks.length);
    for (const s of stocks.slice(0, 5)) {
      console.log('    -', s.name, '| tags:', (s.tags || []).join(', ') || 'none');
    }

    const stockIds = stocks.map((s) => s._id);
    if (stockIds.length) {
      const orders = await Order.find({
        ipStockId: { $in: stockIds },
        status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
      })
        .project({
          ipAddress: 1,
          productName: 1,
          provider: 1,
          advpsServiceId: 1,
          smartvpsServiceId: 1,
          netbayServiceId: 1,
        })
        .limit(10)
        .toArray();

      console.log('  Active orders on these stocks:', orders.length);
      let cfg2 = cfg;
      let machineIps = new Set();
      if (cfg2) {
        try {
          const api = new JoyApi(cfg2);
          const machines = await api.machineList();
          machineIps = new Set(machines.map((m) => String(m.ip || '').trim()).filter(Boolean));
        } catch (_) {}
      }

      for (const o of orders) {
        const ip = (o.ipAddress || '').trim();
        const wouldSmartVps =
          o.smartvpsServiceId ||
          o.productName?.includes('🌊') ||
          o.productName?.includes('103.195') ||
          o.productName?.includes('🏅') ||
          ip.startsWith('103.195');
        const wouldAdvps = o.advpsServiceId || o.productName?.includes('⚡');
        const ipInJoy = ip && machineIps.has(ip);
        console.log(
          '    order IP=' + (ip || 'MISSING') +
            ' | joyMatch=' + (ipInJoy ? 'YES' : 'NO') +
            ' | blocksJoy: smartvps=' + !!wouldSmartVps +
            ' advps=' + !!wouldAdvps +
            ' netbay=' + !!o.netbayServiceId
        );
      }
    }
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
