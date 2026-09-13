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
  usesHostdzireLiveStock,
  usesResellerLiveStock,
  usesKurohostLiveStock,
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
  isKurohostIpStock,
  syncKurohostIpStockRow,
  verifyKurohostMemoryInStock,
  isKurohostVariantInStock,
} = require('@/lib/kurohostLiveStock');

const {
  isHostdzireIpStock,
  syncHostdzireIpStockRow,
  isHostdzireVariantInStock,
} = require('@/lib/hostdzireLiveStock');

const {
  isResellerIpStock,
  syncResellerIpStockRow,
  verifyResellerMemoryInStock,
} = require('@/lib/resellerLiveStock');

const {
  buildSmartVpsBlockFromPackage,
  isSmartVpsMemoryListed,
  normalizeMemoryTierKey,
  validateSmartVpsPackageRam,
} = require('@/lib/smartvpsPackageRam');

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

  const existingMemory = stock.memoryOptions instanceof Map
    ? Object.fromEntries(stock.memoryOptions)
    : (typeof stock.memoryOptions?.toObject === 'function'
      ? stock.memoryOptions.toObject({ minimize: true })
      : { ...(stock.memoryOptions || {}) });

  const { memoryOptions, smartvpsBlock } = pkg
    ? buildSmartVpsBlockFromPackage(pkg, smartvps || {}, existingMemory)
    : {
        memoryOptions: existingMemory,
        smartvpsBlock: {
          ...(smartvps || {}),
          provider: 'smartvps',
          packageName,
          availableQty: qty,
        },
      };

  const updatePayload = {
    memoryOptions,
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
  return Company.findById(stock.company).select('netbayApi hostdzireApi resellerApi kurohostApi').lean();
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
  const { resolveNetbayBillingMemory } = require('@/lib/netbayGroupTags');
  const checkMemory = resolveNetbayBillingMemory(stock, memory) || memory;
  const netbayLive = isNetbayIpStock(stock) && usesNetbayLiveStock(stock, company);
  const hostdzireLive = isHostdzireIpStock(stock) && usesHostdzireLiveStock(stock, company);
  const kurohostLive = isKurohostIpStock(stock) && usesKurohostLiveStock(stock, company);
  const resellerLive = isResellerIpStock(stock) && usesResellerLiveStock(stock, company);

  try {
    if (isAdvpsPlan(stock)) {
      stock = await syncAdvpsIpStockRow(stock);
    } else if (isSmartVpsPlan(stock)) {
      stock = await syncSmartVpsIpStockRow(stock);
    } else if (netbayLive) {
      stock = await syncNetbayIpStockRow(stock, { force: true, memoryOnly: checkMemory || null });
    } else if (hostdzireLive) {
      stock = await syncHostdzireIpStockRow(stock, { force: true, memoryOnly: memory || null });
    } else if (kurohostLive) {
      stock = await syncKurohostIpStockRow(stock, { force: true, memoryOnly: memory || null });
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

  if (!isAdvpsVariantInStock(stock, checkMemory)) {
    return {
      ok: false,
      message: customerStockUnavailableMessage(
        `${memory} is currently out of stock. Please refresh and pick another plan.`
      ),
      stock: stock.toObject?.() || stock,
      synced: true,
    };
  }

  if (netbayLive && checkMemory && !isNetbayVariantInStock(stock, checkMemory, company)) {
    const liveVerify = await verifyNetbayMemoryInStock(stock, checkMemory);
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

  if (hostdzireLive && !isHostdzireVariantInStock(stock, company, memory)) {
    return {
      ok: false,
      message: customerStockUnavailableMessage(
        memory
          ? `${memory} is currently out of stock on HostDzire. Please refresh or pick another plan.`
          : 'This IP is currently out of stock on HostDzire. Please refresh or pick another plan.'
      ),
      stock: stock.toObject?.() || stock,
      synced: true,
    };
  }

  if (kurohostLive && memory && !isKurohostVariantInStock(stock, memory, company)) {
    const liveVerify = await verifyKurohostMemoryInStock(stock, memory);
    if (!liveVerify.ok) {
      return {
        ok: false,
        message: customerStockUnavailableMessage(
          liveVerify.message ||
            `${memory} is unavailable in this KuroHost zone. Please refresh and pick another plan.`
        ),
        stock: stock.toObject?.() || stock,
        synced: true,
      };
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

  if (isSmartVpsPlan(stock) && memory) {
    if (!isSmartVpsMemoryListed(stock, memory)) {
      const allowed = stock.defaultConfigurations?.smartvps?.allowedRams;
      const allowedLabel = Array.isArray(allowed) && allowed.length
        ? allowed.map((gb) => `${gb}GB`).join(', ')
        : 'another size';
      return {
        ok: false,
        message: customerStockUnavailableMessage(
          `${memory} is not available for this plan. Please choose ${allowedLabel}.`
        ),
        stock: stock.toObject?.() || stock,
        synced: true,
      };
    }

    const pkgName = stock.defaultConfigurations?.smartvps?.packageName;
    if (pkgName) {
      try {
        const api = new SmartVpsAPI();
        const raw = await api.ipstock();
        const obj = normalizeSmartVpsResponse(raw);
        const packages = Array.isArray(obj?.packages) ? obj.packages : [];
        const pkg = packages.find((p) => String(p.name) === String(pkgName));
        const ramGb = normalizeMemoryTierKey(memory).replace(/GB$/i, '');
        const ramCheck = pkg ? validateSmartVpsPackageRam(pkg, ramGb) : { ok: true };
        if (!ramCheck.ok) {
          const allowedLabel = (ramCheck.allowedRams || []).map((gb) => `${gb}GB`).join(', ') || 'another size';
          return {
            ok: false,
            message: customerStockUnavailableMessage(
              `${memory} is not available for this plan. Please choose ${allowedLabel}.`
            ),
            stock: stock.toObject?.() || stock,
            synced: true,
          };
        }
      } catch (ramErr) {
        console.warn('[SYNC-PURCHASE] SmartVPS RAM live check failed:', ramErr.message);
      }
    }
  }

  return {
    ok: true,
    message: 'In stock',
    stock: stock.toObject?.() || stock,
    synced: isAdvpsPlan(stock) || isSmartVpsPlan(stock) || netbayLive || hostdzireLive || kurohostLive || resellerLive,
  };
}

export async function refreshAndVerifySlotIpPurchase(slotIpPackageId, quantity = 1) {
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
  const need = Math.max(1, Math.floor(Number(quantity) || 1));
  if (!pkg.available || availableIps.length < need) {
    return {
      ok: false,
      message: customerStockUnavailableMessage(
        availableIps.length === 0
          ? 'No slot IPs available in this package'
          : `Only ${availableIps.length} slot IP${availableIps.length === 1 ? '' : 's'} available, need ${need}`,
        { kind: 'slot' }
      ),
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

export async function refreshAndVerifyPurchase({ ipStockId, slotIpPackageId, memory, quantity }) {
  if (slotIpPackageId) {
    return refreshAndVerifySlotIpPurchase(slotIpPackageId, quantity);
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
