require('dotenv').config();
const mongoose = require('mongoose');
const JoyApi = require('../src/services/joyApi');
const { getCompanyJoyApiConfig } = require('../src/lib/companyJoyApi');

async function main() {
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Company = mongoose.connection.collection('companies');
  const Order = mongoose.connection.collection('orders');

  const joyCo = await Company.findOne({ name: /JoyService/i });
  if (!joyCo) {
    console.log('No JoyService company');
    return;
  }
  const cfg = getCompanyJoyApiConfig(joyCo);
  const api = new JoyApi(cfg);
  const machines = await api.machineList();
  const joyIps = new Set(machines.map((m) => String(m.ip || '').trim()));

  console.log('Joy panel IPs:', joyIps.size);

  // Orders whose IP exists in Joy panel
  const orders = await Order.find({
    status: { $in: ['confirmed', 'active', 'paid', 'completed'] },
    ipAddress: { $exists: true, $ne: '' },
  })
    .project({ ipAddress: 1, ipStockId: 1, productName: 1, userEmail: 1, provider: 1 })
    .toArray();

  const joyOrders = orders.filter((o) => joyIps.has(String(o.ipAddress || '').trim()));
  console.log('Orders with IP in Joy panel:', joyOrders.length);

  const IPStock = mongoose.connection.collection('ipstocks');
  for (const o of joyOrders.slice(0, 15)) {
    let stockName = 'none';
    let stockCompany = 'none';
    if (o.ipStockId) {
      const s = await IPStock.findOne({ _id: o.ipStockId }, { projection: { name: 1, company: 1 } });
      if (s) {
        stockName = s.name;
        stockCompany = String(s.company) === String(joyCo._id) ? 'JoyService ✓' : String(s.company);
      }
    }
    console.log(
      `- ${o.ipAddress} | stock=${stockName.slice(0, 50)} | companyLink=${stockCompany} | ${o.productName?.slice(0, 35)}`
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
