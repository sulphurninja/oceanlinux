import connectDB from '@/lib/db';
import IPStock from '@/models/ipStockModel';
const SlotIPPackage = require('@/models/slotIpPackageModel');
const SmartVpsAPI = require('@/services/smartvpsApi');
const {
  toPlainConfigurations,
  cloneAdvpsForMutation,
  fetchAdvpsStockMap,
  applyStockMapToAdvpsBlock,
  rowLooksInStock,
  invalidateAdvpsStockMapCache,
} = require('@/lib/advpsLiveStock');
import {
  isIpStockPurchasable,
  usesStockCount,
  isIpStockHiddenFromStore,
  usesNetbayLiveStock,
  usesResellerLiveStock,
  storeAutoUnhideUpdate,
} from '@/lib/ipStockAvailability';
import { customerStockUnavailableMessage } from '@/lib/customerStockMessages';
import Company from '@/models/companyModel';

const {
  isNetbayIpStock,
  syncNetbayIpStockRow,
  verifyNetbayMemoryInStock,
} = require('@/lib/netbayLiveStock');

const {
  isResellerIpStock,
  syncResellerIpStockRow,
  verifyResellerMemoryInStock,
} = require('@/lib/resellerLiveStock');

function normalizeSmartVpsResponse(payload) {
  if (payload == null) return payload;
  try {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        /* continue */
      }
      const unquoted = payload.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
      try {
        return JSON.parse(unquoted);
      } catch {
        /* continue */
      }
    }
    return payload;
  } catch {
    return payload;
  }
}

function isAdvpsPlan(stock) {
  return String(stock?.name || '').trimStart().startsWith('⚡');
}

function isSmartVpsPlan(stock) {
  return String(stock?.name || '').trimStart().startsWith('🌊');
}

async function syncAdvpsIpStockRow(stock) {
  const defaults = toPlainConfigurations(stock.defaultConfigurations);
  const advpsRaw = defaults?.advps;
  if (!advpsRaw) return stock;

  invalidateAdvpsStockMapCache();
  const advpsLive = cloneAdvpsForMutation(advpsRaw);
  const stockMap = await fetchAdvpsStockMap([advpsLive], { verbose: true });
  const hasStock = applyStockMapToAdvpsBlock(advpsLive, stockMap, {
    verbose: true,
    label: stock.name,
    ipStockId: stock._id,
  });

  const updatePayload = {
    defaultConfigurations: { ...defaults, advps: advpsLive },
  };
  if (!stock.availabilityManual) {
    updatePayload.available = hasStock;
    Object.assign(updatePayload, storeAutoUnhideUpdate(stock, hasStock));
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

async function syncSmartVpsIpStockRow(stock) {
  const defaults = toPlainConfigurations(stock.defaultConfigurations);
  const smartvps = defaults?.smartvps;
  const fullName = String(stock.name || '').replace(/^🌊 /, '');
  const packageName = smartvps?.packageName || fullName.split(/[\s(]/)[0];

  const api = new SmartVpsAPI();
  const raw = await api.ipstock();
  const obj = normalizeSmartVpsResponse(raw);
  const packages = Array.isArray(obj?.packages) ? obj.packages : [];

  const pkg = packages.find((p) => String(p.name) === String(packageName));
  const qty = pkg ? Number(pkg.ipv4 || 0) : 0;
  const isAvailable = !!(pkg && qty > 0 && String(pkg.status).toLowerCase() === 'active');

  const smartvpsBlock = {
    ...(smartvps || {}),
    provider: 'smartvps',
    packagePid: pkg ? String(pkg.id) : smartvps?.packagePid,
    packageName,
    availableQty: qty,
  };

  const updatePayload = {
    defaultConfigurations: { ...defaults, smartvps: smartvpsBlock },
  };
  if (!stock.availabilityManual) {
    updatePayload.available = isAvailable;
    Object.assign(updatePayload, storeAutoUnhideUpdate(stock, isAvailable));
  }

  await IPStock.findByIdAndUpdate(stock._id, updatePayload);
  return IPStock.findById(stock._id);
}

function isAdvpsVariantInStock(stock, memory) {
  if (!memory || !isAdvpsPlan(stock)) return true;
  const advps = toPlainConfigurations(stock.defaultConfigurations)?.advps;
  const variant = advps?.variants?.[memory];
  if (!variant) return isIpStockPurchasable(stock);
  return rowLooksInStock({ stock: variant.stock, stockStatus: variant.stockStatus });
}

function isNetbayVariantInStock(stock, memory, company) {
  if (!memory || !isNetbayIpStock(stock)) return true;
  if (!usesNetbayLiveStock(stock, company)) return isIpStockPurchasable(stock, 1, company);
  if (stock.available) return true;
  const cfg = toPlainConfigurations(stock.defaultConfigurations)?.netbay;
  const variant = cfg?.variantStock?.[memory];
  if (!variant) return isIpStockPurchasable(stock, 1, company);
  if (variant.available === true) return true;
  if (variant.skipped || variant.available === null) {
    const primary = cfg?.variantStock?.['2GB'];
    if (primary?.available === true) return true;
    return false;
  }
  return false;
}

function isResellerVariantInStock(stock, memory, company) {
  if (!memory || !isResellerIpStock(stock)) return true;
  const { hasUnallocatedCompanyInventory } = require('@/lib/companyInventory');
  if (hasUnallocatedCompanyInventory(stock)) return true;
  if (!usesResellerLiveStock(stock, company)) return isIpStockPurchasable(stock, 1, company);
  if (stock.available) return true;
  const cfg = toPlainConfigurations(stock.defaultConfigurations)?.resellerApi;
  const variant = cfg?.variantStock?.[memory];
  if (!variant) return isIpStockPurchasable(stock, 1, company);
  if (variant.available === true) return true;
  return false;
}

async function loadCompanyForStock(stock) {
  if (!stock?.company) return null;
  return Company.findById(stock.company).select('netbayApi resellerApi').lean();
}

/**
 * Live-sync one IPStock row from ADVPS/SmartVPS/Netbay (if applicable) and verify purchasable.
 */
export async function refreshAndVerifyIpStockPurchase(ipStockId, memory) {
  await connectDB();

  let stock = await IPStock.findById(ipStockId);
  if (!stock) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('Product not found'),
      synced: false,
    };
  }

  let company = await loadCompanyForStock(stock);
  const netbayLive = isNetbayIpStock(stock) && usesNetbayLiveStock(stock, company);
  const resellerLive = isResellerIpStock(stock) && usesResellerLiveStock(stock, company);

  try {
    if (isAdvpsPlan(stock)) {
      stock = await syncAdvpsIpStockRow(stock);
    } else if (isSmartVpsPlan(stock)) {
      stock = await syncSmartVpsIpStockRow(stock);
    } else if (netbayLive) {
      stock = await syncNetbayIpStockRow(stock, { force: true, memoryOnly: memory || null });
    } else if (resellerLive) {
      stock = await syncResellerIpStockRow(stock, { force: true, memoryOnly: memory || null });
    } else {
      stock = await IPStock.findById(ipStockId);
    }
  } catch (err) {
    console.error('[SYNC-PURCHASE] Live stock sync failed:', err.message);
    return {
      ok: false,
      message: customerStockUnavailableMessage(err.message),
      synced: false,
    };
  }

  if (!stock) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('Product not found'),
      synced: true,
    };
  }

  if (isIpStockHiddenFromStore(stock)) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('This product is not available'),
      stock: stock.toObject?.() || stock,
      synced: true,
    };
  }

  if (!isIpStockPurchasable(stock, 1, company)) {
    const msg = usesStockCount(stock, company)
      ? 'This product is out of stock'
      : 'This product is currently out of stock';
    return {
      ok: false,
      message: customerStockUnavailableMessage(msg),
      stock: stock.toObject?.() || stock,
      synced: true,
    };
  }

  if (!isAdvpsVariantInStock(stock, memory)) {
    return {
      ok: false,
      message: customerStockUnavailableMessage(
        `${memory} is currently out of stock. Please refresh and pick another plan.`
      ),
      stock: stock.toObject?.() || stock,
      synced: true,
    };
  }

  if (netbayLive && memory && !isNetbayVariantInStock(stock, memory, company)) {
    const liveVerify = await verifyNetbayMemoryInStock(stock, memory);
    if (!liveVerify.ok) {
      return {
        ok: false,
        message: customerStockUnavailableMessage(
          liveVerify.message ||
            `${memory} is currently out of stock at this location. Please refresh and pick another plan.`
        ),
        stock: stock.toObject?.() || stock,
        synced: true,
      };
    }
    if (liveVerify.result?.available === true) {
      company = company || (await loadCompanyForStock(stock));
    }
  }

  if (resellerLive && memory && !isResellerVariantInStock(stock, memory, company)) {
    const liveVerify = await verifyResellerMemoryInStock(stock, memory);
    if (!liveVerify.ok) {
      return {
        ok: false,
        message: customerStockUnavailableMessage(
          liveVerify.message ||
            `${memory} is currently out of stock on the panel. Top up wallet or pick another plan.`
        ),
        stock: stock.toObject?.() || stock,
        synced: true,
      };
    }
  }

  return {
    ok: true,
    message: 'In stock',
    stock: stock.toObject?.() || stock,
    synced: isAdvpsPlan(stock) || isSmartVpsPlan(stock) || netbayLive || resellerLive,
  };
}

export async function refreshAndVerifySlotIpPurchase(slotIpPackageId) {
  await connectDB();

  const pkg = await SlotIPPackage.findById(slotIpPackageId);
  if (!pkg) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('Slot IP package not found', { kind: 'slot' }),
      synced: false,
    };
  }

  const availableIps = (pkg.ips || []).filter((ip) => !ip.allocated);
  if (!pkg.available || availableIps.length === 0) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('No slot IPs available in this package', { kind: 'slot' }),
      synced: true,
    };
  }

  return {
    ok: true,
    message: 'In stock',
    available: availableIps.length,
    synced: true,
  };
}

export async function refreshAndVerifyPurchase({ ipStockId, slotIpPackageId, memory }) {
  if (slotIpPackageId) {
    return refreshAndVerifySlotIpPurchase(slotIpPackageId);
  }
  if (!ipStockId) {
    return {
      ok: false,
      message: customerStockUnavailableMessage('Product not found'),
      synced: false,
    };
  }
  return refreshAndVerifyIpStockPurchase(ipStockId, memory);
}
