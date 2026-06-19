const IPStock = require('@/models/ipStockModel');

const VALID_OS = ['CentOS 7', 'Ubuntu 22', 'Windows 2022 64'];

function normalizeOs(raw) {
  const s = String(raw || '').trim();
  if (VALID_OS.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('centos')) return 'CentOS 7';
  if (lower.includes('ubuntu')) return 'Ubuntu 22';
  if (lower.includes('windows')) return 'Windows 2022 64';
  return 'Windows 2022 64';
}

/** Company stock uses embedded inventory rows (vs plain stockCount). */
function usesPreconfiguredInventory(stock) {
  return !!(stock?.company && Array.isArray(stock.inventoryItems) && stock.inventoryItems.length > 0);
}

function countUnallocatedInventory(stock) {
  if (!Array.isArray(stock?.inventoryItems)) return 0;
  return stock.inventoryItems.filter((i) => !i.allocated).length;
}

/** Parse bulk lines: ip,user,pass,os OR ip|user|pass|os (one per line) */
function parseInventoryBulkLines(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes('|') ? '|' : ',';
    const parts = line.split(sep).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push({ line: i + 1, content: line, reason: 'Need ip, username, password (optional OS)' });
      continue;
    }
    const [ipAddress, username, password, osPart] = parts;
    if (!ipAddress || !username || !password) {
      errors.push({ line: i + 1, content: line, reason: 'Missing ip, username, or password' });
      continue;
    }
    items.push({
      ipAddress,
      username,
      password,
      os: normalizeOs(osPart),
      allocated: false,
      orderId: null,
      allocatedAt: null,
    });
  }

  return { items, errors };
}

async function syncStockCountFromInventory(stockId) {
  const stock = await IPStock.findById(stockId);
  if (!stock || !usesPreconfiguredInventory(stock)) return stock;
  const remaining = countUnallocatedInventory(stock);
  stock.stockCount = remaining;
  stock.available = remaining > 0;
  await stock.save();
  return stock;
}

/**
 * Assign the next unallocated inventory row to a confirmed order.
 * Idempotent if order.inventoryItemId is already set.
 */
async function allocateCompanyInventoryForOrder(order) {
  if (!order?.ipStockId || order.inventoryItemId) {
    return { allocated: false, skipped: true };
  }

  try {
    const allocated = await IPStock.findOneAndUpdate(
      { _id: order.ipStockId, 'inventoryItems.allocated': false },
      {
        $set: {
          'inventoryItems.$.allocated': true,
          'inventoryItems.$.orderId': order._id,
          'inventoryItems.$.allocatedAt': new Date(),
        },
      },
      { new: true }
    );

    if (!allocated) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'No pre-configured servers available in stock';
      await order.save();
      return { allocated: false, reason: 'no_inventory_available' };
    }

    const item = allocated.inventoryItems.find(
      (row) => row.orderId && row.orderId.toString() === order._id.toString()
    );

    if (!item) {
      order.provisioningStatus = 'failed';
      order.provisioningError = 'Company inventory allocation mismatch';
      await order.save();
      return { allocated: false, reason: 'allocation_mismatch' };
    }

    order.inventoryItemId = item._id.toString();
    order.ipAddress = item.ipAddress;
    order.username = item.username;
    order.password = item.password;
    order.os = item.os || order.os;
    order.provisioningStatus = 'active';
    order.status = 'active';
    order.autoProvisioned = true;
    order.inventoryDecremented = true;
    await order.save();

    await syncStockCountFromInventory(order.ipStockId);

    return { allocated: true, ipAddress: item.ipAddress };
  } catch (err) {
    order.provisioningStatus = 'failed';
    order.provisioningError = `Inventory allocation failed: ${err.message}`;
    await order.save();
    return { allocated: false, reason: err.message };
  }
}

module.exports = {
  VALID_OS,
  normalizeOs,
  usesPreconfiguredInventory,
  countUnallocatedInventory,
  parseInventoryBulkLines,
  syncStockCountFromInventory,
  allocateCompanyInventoryForOrder,
};
