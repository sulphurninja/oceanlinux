const fs = require('fs');
const path = require('path');
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

const ORDERS = [
  { pay: 'pay_TvyaK6gjdQXTzH', id: '6aeabcb90f788d198d8ac783', nexa: '2632' },
  { pay: 'pay_TvyUEps5d43DYC', id: '6aeabb570f788d198d87ed72', nexa: '2631' },
  { pay: 'pay_TvupOAe2j7gm1O', id: '6aea89190f788d198d339724', nexa: '2562' },
];

function displayIpFromDelivery(delivered) {
  const host = String(delivered?.ip || '').trim();
  const port = String(delivered?.port || '').trim();
  if (!host) return '';
  if (!port || host.includes(':')) return host;
  return `${host}:${port}`;
}

(async () => {
  process.chdir(path.join(__dirname, '..'));
  const Module = require('module');
  const srcRoot = path.join(__dirname, '..', 'src');
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return orig.call(this, path.join(srcRoot, request.slice(2)), parent, isMain, options);
    }
    return orig.call(this, request, parent, isMain, options);
  };

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGOOSE_URL);
  const Order = require('../src/models/orderModel').default;
  const IPStock = require('../src/models/ipStockModel');
  const Company = (await import('../src/models/companyModel.js')).default;
  const NexaApi = require('../src/services/nexaApi');
  const { getCompanyNexaApiConfig } = require('../src/lib/companyNexaApi');
  const { finalizeIpAssignmentForOrder } = require('../src/lib/orderIpOwnership');
  const { calculateCompanyExpiryDate } = await import('../src/lib/expiryHelper.js');

  for (const row of ORDERS) {
    console.log('\n==========', row.pay, 'nexa', row.nexa, '==========');
    const order = await Order.findById(row.id);
    if (!order) {
      console.log('ORDER NOT FOUND');
      continue;
    }
    if (order.ipAddress && order.provisioningStatus === 'active') {
      console.log('Already active', order.ipAddress);
      continue;
    }

    const stock = await IPStock.findById(order.ipStockId).lean();
    const company = await Company.findById(stock.company).lean();
    const api = new NexaApi({ ...getCompanyNexaApiConfig(company), timeoutMs: 90000 });

    let delivered = null;
    let nexaPayload = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        nexaPayload = await api.control(row.nexa, 'status');
        delivered = NexaApi.extractPurchaseDelivery(nexaPayload);
        if (displayIpFromDelivery(delivered)) break;
      } catch (e) {
        console.log('status attempt', attempt, e.message);
      }
      if (attempt < 4) await new Promise((r) => setTimeout(r, 4000));
    }

    if (!delivered || !displayIpFromDelivery(delivered)) {
      try {
        const list = await api.listOrders();
        const nexaRow = (list?.orders || []).find(
          (r) => String(NexaApi.extractOrderId(r)) === row.nexa
        );
        if (nexaRow) {
          delivered = NexaApi.extractPurchaseDelivery(nexaRow);
          nexaPayload = nexaRow;
        }
      } catch (e) {
        console.log('listOrders fallback failed:', e.message);
      }
    }

    const displayIp = displayIpFromDelivery(delivered);
    console.log('Nexa delivery', { displayIp, user: delivered?.username, status: nexaPayload?.status });

    if (!displayIp) {
      console.log('No IP from Nexa yet — not delivered');
      continue;
    }

    let expiryDate = null;
    const rawExpiry = delivered.expiry || nexaPayload?.expires_at;
    if (rawExpiry) {
      const parsed = new Date(rawExpiry);
      if (!Number.isNaN(parsed.getTime())) expiryDate = parsed;
    }
    if (!expiryDate) expiryDate = calculateCompanyExpiryDate();

    const updateData = {
      status: 'active',
      provisioningStatus: 'active',
      provisioningError: '',
      provider: 'nexa',
      nexaOrderId: row.nexa,
      username: delivered.username || order.username || undefined,
      password: delivered.password || order.password || '',
      ipAddress: displayIp,
      autoProvisioned: true,
      os: order.os || 'Ubuntu 22',
      expiryDate,
    };

    await finalizeIpAssignmentForOrder(order, displayIp, updateData);

    const after = await Order.findById(row.id).lean();
    console.log('DELIVERED', {
      status: after.status,
      ip: after.ipAddress,
      user: after.username,
      pass: after.password ? '[set]' : '',
    });
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
