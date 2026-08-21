const IPStock = require('@/models/ipStockModel');
const Order = require('@/models/orderModel').default;
const ResellerApi = require('@/services/resellerApi');
const { getCompanyResellerApiConfig } = require('@/lib/companyResellerApi');

function cleanIp(ip) {
  return String(ip || '').split(':')[0].trim();
}

/**
 * Bidirectional compare: company inventory + orders vs Hostheaven panel VMs.
 */
async function auditCompanyVpsReconciliation(company) {
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    throw new Error('Reseller API (Hostheaven) is not enabled for this company');
  }

  const api = new ResellerApi({
    ...cfg,
    label: cfg.label || company?.name || 'reseller',
  });

  const panelIndex = await api.buildVmIpIndex({ maxPages: 500, pageSize: 100 });

  const stocks = await IPStock.find({ company: company._id }).select('name inventoryItems').lean();
  const stockIds = stocks.map((s) => s._id);

  /** @type {Map<string, object>} */
  const hereByIp = new Map();

  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      const ip = cleanIp(item.ipAddress);
      if (!ip) continue;
      const row = hereByIp.get(ip) || { ip, sources: [] };
      if (!row.sources.includes('inventory')) row.sources.push('inventory');
      row.stockName = stock.name;
      row.inventoryAllocated = !!item.allocated;
      if (item.orderId) row.orderId = String(item.orderId);
      hereByIp.set(ip, row);
    }
  }

  const orders = stockIds.length
    ? await Order.find({
        ipStockId: { $in: stockIds },
        ipAddress: { $exists: true, $nin: ['', null] },
        status: { $nin: ['cancelled', 'failed'] },
      })
        .select('ipAddress status productName _id')
        .lean()
    : [];

  /** Any order site-wide with this IP (avoid missing cross-stock matches) */
  const globalOrderRows = await Order.find({
    ipAddress: { $exists: true, $nin: ['', null] },
    status: { $nin: ['cancelled', 'failed'] },
  })
    .select('ipAddress')
    .lean();

  const orderIpSet = new Set();
  /** @type {Map<string, object>} */
  const orderByIp = new Map();
  for (const order of globalOrderRows) {
    const ip = cleanIp(order.ipAddress);
    if (ip) orderIpSet.add(ip);
  }
  for (const order of orders) {
    const ip = cleanIp(order.ipAddress);
    if (!ip) continue;
    orderIpSet.add(ip);
    if (!orderByIp.has(ip)) {
      orderByIp.set(ip, {
        orderId: String(order._id),
        orderStatus: order.status,
        productName: order.productName || null,
      });
    }
    const row = hereByIp.get(ip) || { ip, sources: [] };
    if (!row.sources.includes('order')) row.sources.push('order');
    row.orderStatus = order.status;
    row.orderId = row.orderId || String(order._id);
    row.productName = order.productName || null;
    hereByIp.set(ip, row);
  }

  const inventoryIpSet = new Set();
  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      const ip = cleanIp(item.ipAddress);
      if (ip) inventoryIpSet.add(ip);
    }
  }

  /** Hostheaven panel par hai lekin kisi company order mein IP nahi */
  const onPanelNotInOrders = [];
  for (const [ip, vm] of panelIndex) {
    if (orderIpSet.has(ip)) continue;
    onPanelNotInOrders.push({
      ip,
      vmId: vm.vmId,
      serverName: vm.serverName || '',
      expiryDate: vm.expiryDate ? new Date(vm.expiryDate).toISOString() : null,
      panelStatus: vm.raw?.liveState || vm.raw?.status || vm.raw?.vmStatus || '',
      inInventory: inventoryIpSet.has(ip),
    });
  }

  /** Company order mein IP hai lekin Hostheaven panel par VM nahi */
  const ordersNotOnPanel = [];
  for (const [ip, meta] of orderByIp) {
    if (panelIndex.has(ip)) continue;
    ordersNotOnPanel.push({
      ip,
      orderId: meta.orderId,
      orderStatus: meta.orderStatus,
      productName: meta.productName,
      inInventory: inventoryIpSet.has(ip),
    });
  }

  const onPanelNotHere = [];
  for (const [ip, vm] of panelIndex) {
    if (hereByIp.has(ip)) continue;
    onPanelNotHere.push({
      ip,
      vmId: vm.vmId,
      serverName: vm.serverName || '',
      expiryDate: vm.expiryDate ? new Date(vm.expiryDate).toISOString() : null,
      panelStatus: vm.raw?.liveState || vm.raw?.status || vm.raw?.vmStatus || '',
    });
  }

  const hereNotOnPanel = [];
  let matchedCount = 0;
  for (const [ip, row] of hereByIp) {
    if (panelIndex.has(ip)) {
      matchedCount += 1;
      continue;
    }
    hereNotOnPanel.push({
      ip,
      sources: row.sources,
      stockName: row.stockName || null,
      orderId: row.orderId || null,
      orderStatus: row.orderStatus || null,
      inventoryAllocated: row.inventoryAllocated ?? null,
      productName: row.productName || null,
    });
  }

  const byIp = (a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true });
  onPanelNotInOrders.sort(byIp);
  ordersNotOnPanel.sort(byIp);
  onPanelNotHere.sort(byIp);
  hereNotOnPanel.sort(byIp);

  return {
    companyId: String(company._id),
    companyName: company.name,
    panelLabel: cfg.label || cfg.baseUrl,
    panelTotal: panelIndex.size,
    orderIpTotal: orderIpSet.size,
    hereTotal: hereByIp.size,
    matchedCount,
    /** Primary lists — orders vs panel */
    onPanelNotInOrdersCount: onPanelNotInOrders.length,
    onPanelNotInOrders,
    ordersNotOnPanelCount: ordersNotOnPanel.length,
    ordersNotOnPanel,
    /** Also: not in inventory nor orders / not on panel at all */
    onPanelNotHereCount: onPanelNotHere.length,
    onPanelNotHere,
    hereNotOnPanelCount: hereNotOnPanel.length,
    hereNotOnPanel,
  };
}

/**
 * Compare Hostheaven/reseller panel VMs vs OceanLinux orders (admin — all orders).
 */
async function auditHostheavenVsOrders(company) {
  const cfg = getCompanyResellerApiConfig(company);
  if (!cfg) {
    throw new Error('Reseller API (Hostheaven) is not enabled for this company');
  }

  const api = new ResellerApi({
    ...cfg,
    label: cfg.label || company?.name || 'reseller',
  });

  const panelIndex = await api.buildVmIpIndex({ maxPages: 500, pageSize: 100 });

  const orderRows = await Order.find({
    ipAddress: { $exists: true, $nin: ['', null] },
  })
    .select('ipAddress status productName user clientTxnId createdAt provisioningStatus')
    .lean();

  const orderIpSet = new Set();
  for (const row of orderRows) {
    const ip = cleanIp(row.ipAddress);
    if (ip) orderIpSet.add(ip);
  }

  const stocks = await IPStock.find({ company: company._id }).select('name inventoryItems').lean();
  const inventoryIpSet = new Set();
  const inventoryByIp = new Map();
  for (const stock of stocks) {
    for (const item of stock.inventoryItems || []) {
      const ip = cleanIp(item.ipAddress);
      if (!ip) continue;
      inventoryIpSet.add(ip);
      inventoryByIp.set(ip, {
        stockName: stock.name,
        allocated: !!item.allocated,
        orderId: item.orderId ? String(item.orderId) : null,
      });
    }
  }

  const untrackedInOrders = [];
  for (const [ip, vm] of panelIndex) {
    if (orderIpSet.has(ip)) continue;
    const inv = inventoryByIp.get(ip);
    untrackedInOrders.push({
      ip,
      vmId: vm.vmId,
      serverName: vm.serverName || '',
      expiryDate: vm.expiryDate ? new Date(vm.expiryDate).toISOString() : null,
      panelStatus: vm.raw?.liveState || vm.raw?.status || vm.raw?.vmStatus || '',
      inCompanyInventory: inventoryIpSet.has(ip),
      inventoryStock: inv?.stockName || null,
      inventoryAllocated: inv?.allocated ?? null,
    });
  }

  untrackedInOrders.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));

  return {
    companyId: String(company._id),
    companyName: company.name,
    panelLabel: cfg.label || cfg.baseUrl,
    hostheavenTotalVms: panelIndex.size,
    oceanlinuxOrdersWithIp: orderIpSet.size,
    companyInventoryIps: inventoryIpSet.size,
    untrackedInOrdersCount: untrackedInOrders.length,
    untrackedInOrders,
  };
}

module.exports = { auditHostheavenVsOrders, auditCompanyVpsReconciliation, cleanIp };
